import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { sendPushToEmployees } from "@/lib/webPush";

const personSelect = {
  id: true,
  employeeCode: true,
  name: true,
  mobile: true,
  role: true,
  designation: true,
  department: true,
  branch: true,
  floor: true,
  isFloorManager: true,
  managerScope: true
};

const includeDuty = {
  requester: { select: personSelect },
  sentBy: { select: personSelect },
  hrDecidedBy: { select: { id: true, name: true } },
  locations: { orderBy: { sequence: "asc" as const } },
  events: { orderBy: { capturedAt: "asc" as const }, include: { location: true } }
};

async function notifyEmployee(employeeIds: string[], actorId: string, title: string, text: string, tag: string) {
  const uniqueIds = Array.from(new Set(employeeIds.filter(Boolean)));
  if (!uniqueIds.length) return;
  try {
    await prisma.notificationBlast.create({
      data: {
        type: "NOTICE",
        text,
        filterType: "SYSTEM",
        filterValue: tag,
        createdById: actorId,
        recipients: { create: uniqueIds.map(employeeId => ({ employeeId })) }
      }
    });
    await sendPushToEmployees(uniqueIds, {
      title,
      body: text,
      url: "/?section=officialDuty",
      tag
    });
  } catch {
    // Notification failure must not block the workflow.
  }
}

async function activeHrAdminIds() {
  return (await prisma.employee.findMany({
    where: { role: { in: ["ADMIN", "HR"] }, status: "ACTIVE", deletedAt: null, exitDate: null },
    select: { id: true }
  })).map(row => row.id);
}

function parseOptionalDateTime(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error("Enter a valid expected date and time.");
  return date;
}

function isAllowedSenior(person: any) {
  if (!person) return false;
  if (person.role === "HR") return true;
  if (person.role !== "EMPLOYEE") return false;
  const designation = String(person.designation || "").toLowerCase();
  return Boolean(person.isFloorManager || person.managerScope || designation.includes("head"));
}

export async function GET() {
  try {
    const session = await requireSession();
    const isHr = session.role === "ADMIN" || session.role === "HR";
    const where = isHr
      ? undefined
      : { OR: [{ requesterId: session.id }, { sentById: session.id }] };

    const [requests, approvers] = await Promise.all([
      prisma.officialDutyRequest.findMany({
        where,
        include: includeDuty,
        orderBy: { createdAt: "desc" },
        take: 300
      }),
      prisma.employee.findMany({
        where: {
          status: "ACTIVE",
          deletedAt: null,
          exitDate: null,
          OR: [
            { role: "HR" },
            { role: "EMPLOYEE", isFloorManager: true },
            { role: "EMPLOYEE", managerScope: { not: null } },
            { role: "EMPLOYEE", designation: { contains: "head", mode: "insensitive" } }
          ]
        },
        select: personSelect,
        orderBy: { name: "asc" }
      })
    ]);

    return ok({ requests, approvers });
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "EMPLOYEE") throw new Error("Official Duty requests can be raised from an employee profile.");

    const body = await req.json();
    const purpose = String(body.purpose || "").trim();
    const sentByType = String(body.sentByType || "SENIOR").trim().toUpperCase();
    const sentById = String(body.sentById || "").trim();
    const ownerName = String(body.ownerName || "").trim();
    const expectedStartAt = parseOptionalDateTime(body.expectedStartAt);
    const expectedReturnAt = parseOptionalDateTime(body.expectedReturnAt);
    const rawLocations = Array.isArray(body.locations) ? body.locations : [];
    const locations = rawLocations
      .map((item: any) => ({ name: String(item?.name || "").trim(), addressText: String(item?.addressText || "").trim() }))
      .filter((item: any) => item.name);

    if (!purpose) throw new Error("Official work purpose is required.");
    if (!["OWNER", "HR", "SENIOR"].includes(sentByType)) throw new Error("Select Owner, HR or Senior as Sent By.");
    if (locations.length < 1 || locations.length > 3) throw new Error("Add 1 to 3 work locations.");
    if (expectedStartAt && expectedReturnAt && expectedReturnAt <= expectedStartAt) throw new Error("Expected return time must be after expected departure time.");

    let sender: any = null;
    let approvalMode = "TWO_STEP";
    let initialStatus = "PENDING_SENDER";
    let initialSenderStatus = "PENDING";

    if (sentByType === "OWNER") {
      if (!ownerName) throw new Error("Enter the owner's name.");
      approvalMode = "ONE_STEP";
      initialStatus = "PENDING_HR";
      initialSenderStatus = "NOT_REQUIRED";
    } else {
      if (!sentById) throw new Error(`Select the ${sentByType === "HR" ? "HR" : "senior"} who sent you.`);
      if (sentById === session.id) throw new Error("The sending person must be different from the requester.");
      sender = await prisma.employee.findFirst({
        where: { id: sentById, status: "ACTIVE", deletedAt: null, exitDate: null },
        select: personSelect
      });
      if (!sender || !isAllowedSenior(sender)) throw new Error("Selected person is not an eligible HR, Team Head or Floor Manager.");
      if (sentByType === "HR" && sender.role !== "HR") throw new Error("Please select an HR employee.");
      if (sentByType === "SENIOR" && sender.role === "HR") throw new Error("For a senior request, select a Team Head or Floor Manager.");

      if (sentByType === "HR") {
        approvalMode = "ONE_STEP";
        initialStatus = "PENDING_HR";
        initialSenderStatus = "NOT_REQUIRED";
      }
    }

    const request = await prisma.officialDutyRequest.create({
      data: {
        requesterId: session.id,
        sentById: sender?.id || null,
        sentByType,
        ownerName: sentByType === "OWNER" ? ownerName : null,
        approvalMode,
        purpose,
        expectedStartAt,
        expectedReturnAt,
        status: initialStatus,
        senderStatus: initialSenderStatus,
        locations: {
          create: locations.map((location: any, index: number) => ({
            sequence: index + 1,
            name: location.name,
            addressText: location.addressText || null
          }))
        }
      },
      include: includeDuty
    });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "CREATE_OFFICIAL_DUTY_REQUEST",
      target: request.id,
      details: { sentByType, sentById: sender?.id || null, ownerName: sentByType === "OWNER" ? ownerName : null, approvalMode, purpose, locations }
    });

    if (approvalMode === "TWO_STEP" && sender?.id) {
      await notifyEmployee(
        [sender.id],
        session.id,
        "Official Duty Approval Required",
        `${session.name} submitted an Official Duty request for ${locations.map((x: any) => x.name).join(", ")}. Your approval is required before HR approval.`,
        `official-duty-sender-${request.id}`
      );
    } else if (sentByType === "HR" && sender?.id) {
      await notifyEmployee(
        [sender.id],
        session.id,
        "Official Duty Approval Required",
        `${session.name} submitted an Official Duty request sent by you. Your single approval will activate the duty.`,
        `official-duty-hr-one-step-${request.id}`
      );
    } else {
      await notifyEmployee(
        await activeHrAdminIds(),
        session.id,
        "Official Duty Approval Required",
        `${session.name} submitted an Official Duty request sent by Owner ${ownerName}. HR/Admin approval is required.`,
        `official-duty-owner-${request.id}`
      );
    }

    return ok({ request });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim().toUpperCase();
    if (!id) throw new Error("Official Duty request is required.");

    const current = await prisma.officialDutyRequest.findUnique({ where: { id }, include: includeDuty });
    if (!current) throw new Error("Official Duty request not found.");

    if (action === "SENDER_APPROVE" || action === "SENDER_REJECT") {
      if (current.approvalMode !== "TWO_STEP") throw new Error("Sender approval is not required for this request.");
      if (session.id !== current.sentById) throw new Error("Only the selected sending senior can take this approval action.");
      if (current.senderStatus !== "PENDING") throw new Error("Sender approval has already been decided.");
      const rejecting = action === "SENDER_REJECT";
      const reason = String(body.reason || "").trim();
      if (rejecting && !reason) throw new Error("Rejection reason is required.");

      const updated = await prisma.officialDutyRequest.update({
        where: { id },
        data: {
          senderStatus: rejecting ? "REJECTED" : "APPROVED",
          senderRejectionReason: rejecting ? reason : null,
          senderDecidedAt: new Date(),
          status: rejecting ? "REJECTED" : "PENDING_HR"
        },
        include: includeDuty
      });

      await addAuditLog({ actorId: session.id, actorName: session.name, action, target: id, details: { reason } });

      if (rejecting) {
        await notifyEmployee([current.requesterId], session.id, "Official Duty Rejected", `${session.name} rejected your Official Duty request. Reason: ${reason}`, `official-duty-rejected-${id}`);
      } else {
        await notifyEmployee(await activeHrAdminIds(), session.id, "Official Duty HR Approval Required", `${current.requester.name}'s Official Duty request has been approved by ${session.name}. HR final approval is required.`, `official-duty-hr-${id}`);
      }
      return ok({ request: updated });
    }

    if (action === "HR_APPROVE" || action === "HR_REJECT") {
      if (session.role !== "ADMIN" && session.role !== "HR") throw new Error("Only HR/Admin can take the Official Duty decision.");
      if (current.approvalMode === "TWO_STEP" && current.senderStatus !== "APPROVED") throw new Error("Senior approval is required before HR decision.");
      if (current.sentByType === "HR" && session.role === "HR" && current.sentById && session.id !== current.sentById) {
        throw new Error("This one-step request must be approved by the HR who sent the employee, or by Admin.");
      }
      if (current.hrStatus !== "PENDING") throw new Error("HR approval has already been decided.");
      const rejecting = action === "HR_REJECT";
      const reason = String(body.reason || "").trim();
      if (rejecting && !reason) throw new Error("Rejection reason is required.");

      const updated = await prisma.officialDutyRequest.update({
        where: { id },
        data: {
          hrStatus: rejecting ? "REJECTED" : "APPROVED",
          hrRejectionReason: rejecting ? reason : null,
          hrDecidedById: session.id,
          hrDecidedAt: new Date(),
          status: rejecting ? "REJECTED" : "APPROVED"
        },
        include: includeDuty
      });

      await addAuditLog({ actorId: session.id, actorName: session.name, action, target: id, details: { reason, approvalMode: current.approvalMode } });
      const recipients = [current.requesterId, current.sentById || ""].filter(Boolean);
      await notifyEmployee(
        recipients,
        session.id,
        rejecting ? "Official Duty Rejected by HR" : "Official Duty Approved",
        rejecting
          ? `HR rejected ${current.requester.name}'s Official Duty request. Reason: ${reason}`
          : `${current.requester.name}'s Official Duty request is approved. Location check-ins can now be recorded.`,
        `official-duty-final-${id}`
      );
      return ok({ request: updated });
    }

    if (action === "LOCATION_EVENT") {
      if (session.id !== current.requesterId) throw new Error("Only the employee on Official Duty can record location events.");
      if (current.status !== "APPROVED" && current.status !== "IN_PROGRESS") throw new Error("Official Duty must be fully approved before location tracking starts.");

      const eventType = String(body.eventType || "").trim().toUpperCase();
      const locationId = String(body.locationId || "").trim() || null;
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const accuracyMeters = body.accuracyMeters == null ? null : Number(body.accuracyMeters);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error("A valid GPS location is required.");
      }

      const events = current.events || [];
      const hasType = (type: string, locId?: string | null) => events.some((event: any) => event.eventType === type && (locId === undefined || event.locationId === locId));
      const sortedLocations = [...current.locations].sort((a: any, b: any) => a.sequence - b.sequence);
      const currentLocation = locationId ? sortedLocations.find((location: any) => location.id === locationId) : null;

      if (eventType === "LEFT_OFFICE") {
        if (events.length) throw new Error("Office departure has already been recorded.");
      } else if (eventType === "REACHED_LOCATION") {
        if (!currentLocation) throw new Error("Select a valid duty location.");
        if (!hasType("LEFT_OFFICE")) throw new Error("Record Left Office first.");
        if (hasType("REACHED_LOCATION", locationId)) throw new Error("Arrival at this location is already recorded.");
        const previous = sortedLocations.find((location: any) => location.sequence === currentLocation.sequence - 1);
        if (previous && !hasType("LEFT_LOCATION", previous.id)) throw new Error("Leave the previous location before checking in here.");
      } else if (eventType === "LEFT_LOCATION") {
        if (!currentLocation) throw new Error("Select a valid duty location.");
        if (!hasType("REACHED_LOCATION", locationId)) throw new Error("Record arrival at this location first.");
        if (hasType("LEFT_LOCATION", locationId)) throw new Error("Departure from this location is already recorded.");
      } else if (eventType === "RETURNED_OFFICE") {
        const lastLocation = sortedLocations[sortedLocations.length - 1];
        if (!lastLocation || !hasType("LEFT_LOCATION", lastLocation.id)) throw new Error("Complete all duty locations before recording office return.");
        if (hasType("RETURNED_OFFICE")) throw new Error("Office return is already recorded.");
      } else {
        throw new Error("Invalid location event.");
      }

      await prisma.officialDutyEvent.create({
        data: { requestId: id, locationId, eventType, latitude, longitude, accuracyMeters: Number.isFinite(accuracyMeters as number) ? accuracyMeters : null }
      });

      const newStatus = eventType === "RETURNED_OFFICE" ? "COMPLETED" : "IN_PROGRESS";
      const updated = await prisma.officialDutyRequest.update({ where: { id }, data: { status: newStatus }, include: includeDuty });
      await addAuditLog({ actorId: session.id, actorName: session.name, action: `OFFICIAL_DUTY_${eventType}`, target: id, details: { latitude, longitude, accuracyMeters, locationId } });

      return ok({ request: updated });
    }

    throw new Error("Invalid Official Duty action.");
  } catch (error) {
    return fail(error);
  }
}
