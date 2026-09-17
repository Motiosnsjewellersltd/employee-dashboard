# Motisons Employee Dashboard

Next.js + Prisma + MySQL employee dashboard built in the same style as the Motisons LMS.

## Default Login

* Username: `admin`
* Password: `admin@1234`

## Main Features

* Admin / HR / Employee login
* Employee management
* Bulk employee Excel import
* Employee photo upload
* ID-based leave import and leave balance
* Employee profile with working period and inactive/exit support
* Birthday reminders
* Message draft and notification history
* WhatsApp-style chat with polling refresh, unread count support, attachments, and edit within 5 minutes
* Mobile menu like LMS

## Excel Formats

### Employee Excel

Required columns:

* Name
* Mobile
* Password
* DOB
* Role
* Designation
* Department
* DOJ
* Status

Optional:

* Exit Date

### Leave Excel

Recommended columns:

* Month/Year
* EmployeeID
* Employee Name
* Mobile
* Leave

EmployeeID is best. If it is blank, system matches by Mobile, then Employee Name.

## Setup Commands

```bash
cd employee-dashboard
npm install
copy .env.example .env
npx prisma generate
npx prisma db push
npm run db:seed
npm run build
npm run start
```

## PM2 Commands

```bash
cd employee-dashboard
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run build
pm2 start npm --name employee-dashboard -- start
pm2 save
```

Restart later:

```bash
pm2 restart employee-dashboard
```

## Local URL

```text
http://localhost:5020
```

## MySQL Database

Create database first:

```sql
CREATE DATABASE motisons\_employee\_dashboard;
```

Then set `.env`:

```env
DATABASE\_URL="mysql://root:root123@localhost:3306/motisons\_employee\_dashboard"
JWT\_SECRET="motisons\_employee\_dashboard\_secret\_change\_me"
NEXT\_PUBLIC\_APP\_URL="http://localhost:5020"
```

