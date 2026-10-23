import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireHrPermission } from "@/lib/permissions";
import { AssetError, assetAccess, assetAttachment, assetDate, assetFailure, assetFields, assetText, assetTypes, indiaDate } from "@/lib/assetHandover";

export const runtime = "nodejs";
const employeeSelect = { id: true, name: true, employeeCode: true, branch: true, department: true, designation: true } as const;
const attachmentSelect = { id: true, fileName: true, fileType: true, fileSize: true } as const;
function ok(data: unknown) { return Response.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } }); }

export async function GET(req: Request) {
  try {
    const session = await assetAccess();
    let canManage = true;
    try { await requireHrPermission(session.role, "hrCanManageAssetHandover"); } catch { canManage = false; }
    const params = new URL(req.url).searchParams;
    const id = assetText(params.get("id"), "Handover ID", 100);
    if (id) {
      const handover = await prisma.assetHandover.findUnique({ where: { id }, include: {
        events: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { attachments: { select: attachmentSelect } } }
      } });
      if (!handover) throw new AssetError("Handover not found.", 404);
      return ok({ handover, canManage });
    }
    const employeeId = assetText(params.get("employeeId"), "Employee", 100);
    const branch = assetText(params.get("branch"), "Branch", 100);
    const itemType = assetText(params.get("itemType"), "Item type", 20);
    const status = assetText(params.get("status"), "Status", 20);
    const q = assetText(params.get("q"), "Search", 200);
    if (status && !["ASSIGNED", "RETURNED"].includes(status)) throw new AssetError("Invalid status.");
    if (itemType && !(assetTypes as readonly string[]).includes(itemType)) throw new AssetError("Invalid item type.");
    const page = Number(params.get("page") || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new AssetError("Invalid page.");
    const where: Prisma.AssetHandoverWhereInput = {
      ...(employeeId ? { employeeId } : {}), ...(branch ? { holderBranch: branch } : {}), ...(itemType ? { itemType } : {}), ...(status ? { status } : {}),
      ...(q ? { OR: ["itemName", "identifier", "holderName", "holderCode"].map(key => ({ [key]: { contains: q, mode: "insensitive" } })) } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.assetHandover.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50 }),
      prisma.assetHandover.count({ where })
    ]);
    return ok({ items, total, page, pageSize: 50, canManage });
  } catch (e) { return assetFailure(e); }
}

export async function POST(req: Request) {
  try {
    const session = await assetAccess(true);
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 4 * 1024 * 1024 + 65536) throw new AssetError("Upload is too large.", 413);
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) throw new AssetError("Submit a handover form.");
    const form = await req.formData();
    const action = assetText(form.get("action"), "Action", 20, true);
    if (!["CREATE", "EDIT", "TRANSFER", "RETURN", "ASSIGN"].includes(action)) throw new AssetError("Invalid action.");
    const fields = action === "CREATE" || action === "EDIT" ? assetFields(form) : null;
    const date = action === "EDIT" ? null : assetDate(form.get("date"));
    const condition = fields?.condition || assetText(form.get("condition"), "Condition", 200, true);
    const accessories = fields?.accessories ?? assetText(form.get("accessories"), "Accessories", 500);
    const remarks = fields?.remarks ?? assetText(form.get("remarks"), "Remarks", 2000);
    const id = action === "CREATE" ? assetText(form.get("requestId"), "Request ID", 100, true) : assetText(form.get("id"), "Handover ID", 100, true);
    if (action === "CREATE" && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new AssetError("Refresh the form and try again.");
    const versionRaw = form.get("version");
    const version = typeof versionRaw === "string" && /^\d+$/.test(versionRaw) ? Number(versionRaw) : -1;
    if (action !== "CREATE" && (!Number.isSafeInteger(version) || version < 0)) throw new AssetError("Refresh the handover and try again.", 409);
    const employeeId = ["CREATE", "TRANSFER", "ASSIGN"].includes(action) ? assetText(form.get("employeeId"), "Employee", 100, true) : null;
    const attachment = await assetAttachment(form);

    const handover = await prisma.$transaction(async tx => {
      const existing = await tx.assetHandover.findUnique({ where: { id } });
      if (action === "CREATE" && existing) {
        const same = existing.employeeId === employeeId && existing.assignedOn.getTime() === date!.getTime() &&
          Object.entries(fields!).every(([key, value]) => (existing as unknown as Record<string, unknown>)[key] === value);
        if (!same) throw new AssetError("This request was already saved. Close the form and refresh.", 409);
        return existing;
      }
      const current = action === "CREATE" ? null : existing;
      if (action !== "CREATE" && !current) throw new AssetError("Handover not found.", 404);
      if (current && current.version !== version) throw new AssetError("This handover changed. Close it, refresh and try again.", 409);
      if (current && date && date < current.movementDate) throw new AssetError("Date cannot be before the last handover/return date.");
      if (current && ["TRANSFER", "RETURN"].includes(action) && current.status !== "ASSIGNED") throw new AssetError("This item has already been returned.", 409);
      if (current && action === "ASSIGN" && current.status !== "RETURNED") throw new AssetError("Use Transfer for an item already with an employee.", 409);
      if (current && action === "TRANSFER" && employeeId === current.employeeId) throw new AssetError("Choose a different employee for transfer.");
      const employee = employeeId ? await tx.employee.findFirst({ where: { id: employeeId, deletedAt: null, role: { not: "ADMIN" } }, select: employeeSelect }) : null;
      if (employeeId && !employee) throw new AssetError("Choose an existing employee.");
      const holder = employee ? { employeeId: employee.id, holderName: employee.name, holderCode: employee.employeeCode, holderBranch: employee.branch,
        holderDepartment: employee.department, holderDesignation: employee.designation } : {};
      const fromEmployee = current && current.status === "ASSIGNED" ? { id: current.employeeId, name: current.holderName, employeeCode: current.holderCode,
        branch: current.holderBranch, department: current.holderDepartment, designation: current.holderDesignation } : undefined;
      let saved;
      if (!current) {
        saved = await tx.assetHandover.create({ data: { id, ...fields!, ...holder, employeeId: employee!.id, holderName: employee!.name,
          assignedOn: date!, movementDate: date!, status: "ASSIGNED" } });
      } else {
        const updated = await tx.assetHandover.updateMany({ where: { id, version }, data: {
          ...(fields || {}), condition, accessories, remarks, ...holder,
          ...(action === "RETURN" ? { status: "RETURNED", employeeId: null } : {}),
          ...(employee ? { status: "ASSIGNED", assignedOn: date! } : {}),
          ...(date ? { movementDate: date } : {}), version: { increment: 1 }
        } });
        if (updated.count !== 1) throw new AssetError("Another user changed this handover. Refresh and try again.", 409);
        saved = await tx.assetHandover.findUniqueOrThrow({ where: { id } });
      }
      await tx.assetHandoverEvent.create({ data: {
        handoverId: id, action, eventDate: date || new Date(indiaDate() + "T00:00:00.000Z"),
        ...(fromEmployee ? { fromEmployee } : {}), ...(employee ? { toEmployee: employee } : {}),
        details: { itemType: saved.itemType, itemName: saved.itemName, identifier: saved.identifier, condition, accessories, remarks,
          ...(action === "EDIT" && current ? { previous: { itemType: current.itemType, itemName: current.itemName, identifier: current.identifier, condition: current.condition, accessories: current.accessories, remarks: current.remarks } } : {}) },
        actorId: session.id, actorName: session.name,
        ...(attachment ? { attachments: { create: attachment } } : {})
      } });
      return saved;
    });
    return ok({ handover });
  } catch (e) { return assetFailure(e); }
}
