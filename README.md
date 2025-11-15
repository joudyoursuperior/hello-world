## Phase 1 – High-Level Architecture & Data Model
This document captures the foundational design decisions before implementation.

### 1. Tech Stack (Chosen)
- **Backend:** Node.js 20 + TypeScript, **NestJS** (opinionated modular structure, DI, testing tools). ORM: Prisma with PostgreSQL.
- **Auth:** Stateless JWT stored in HttpOnly cookies + refresh tokens. Fits multi-tenant APIs and mobile/web clients.
- **Background Jobs:** BullMQ on Redis for reminders, invoice emails, audit batching.
- **Frontend:** Next.js 14 (React + App Router) with TypeScript. UI: Chakra UI + Tailwind for utility classes. i18n: `next-intl` + RTL aware theme.
- **Infrastructure:** Docker for local/dev. Deployable to AWS/GCP/Render. Env vars managed via `.env`. Object storage via S3-compatible service for attachments.

### 2. Architecture Overview
```
[Client (Next.js SPA/SSR)]
    │  HTTPS REST/WS
[API Gateway - NestJS]
    │-- Auth Module (JWT)
    │-- Tenant Context Guard (clinic scoping)
    │-- Feature Modules (Appointments, Patients, Billing, Staff, Files, Reports)
    │
[PostgreSQL + Prisma]  ← strict clinic_id FK on every table
[Redis + BullMQ] ← reminders, email/SMS queues, reporting jobs
[S3-compatible Storage] ← file attachments
[Notification Providers] ← email/SMS via pluggable adapters
```
Key principles:
- Multi-tenant via `clinic_id` on every record + row-level guards in services.
- Backend exposes RESTful JSON APIs + WebSocket hooks later for live updates.
- Frontend uses SSR for auth pages + CSR for dashboards; communicates via token-authenticated APIs.
- Background worker runs the same NestJS codebase with queue processors.

### 3. Core Entities & Relationships
| Entity | Description | Key Relationships |
| --- | --- | --- |
| `Clinic` | Tenant account, subscription info, locale, timezone | 1:N Users, Patients, Appointments, Services, Invoices, Files |
| `User` | Staff member (owner, dentist, etc.) with role + permissions | Belongs to Clinic; may have StaffProfile & Schedule entries |
| `Role` / `Permission` | RBAC definitions (Owner/Admin/Dentist/Receptionist/Accountant/Assistant) | Users reference role; permissions checked per request |
| `Patient` | Demographics, medical info, contact data | Clinic scoped; linked to Appointments, Invoices, Files |
| `Appointment` | Schedules patient with dentist, chair, service | Belongs to Clinic; references Patient, Dentist(User), Service, Room/Chair; ties to Invoice |
| `StaffSchedule` | Working hours, breaks, vacations for staff | Belongs to User & Clinic |
| `Service` | Procedure catalog with pricing | Clinic scoped; used in Appointments & Invoice items |
| `Invoice` | Billing record for appointments/patients | Clinic scoped; has InvoiceItems & Payments |
| `InvoiceItem` | Line items referencing services or custom text | Belongs to Invoice |
| `Payment` | Records payment attempts/results | Belongs to Invoice; stores provider metadata |
| `FileAttachment` | Links to cloud storage assets | Can belong to Patient, Appointment, Invoice |
| `AuditLog` | Tracks sensitive operations | References Clinic, User, entity type/id |
| `Notification` | Outgoing reminder/email/SMS tasks | Linked to Appointment or Invoice |

### 4. Initial Database Schema (Prisma)
```prisma
// file: backend/prisma/schema.prisma (preview)
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  OWNER
  ADMIN
  DENTIST
  HYGIENIST
  ASSISTANT
  RECEPTIONIST
  ACCOUNTANT
}

enum InvoiceStatus {
  DRAFT
  SENT
  PARTIALLY_PAID
  PAID
  OVERDUE
}

enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
}

model Clinic {
  id             String   @id @default(cuid())
  name           String
  slug           String   @unique
  timezone       String   @default("Asia/Riyadh")
  locale         String   @default("en")
  ownerId        String?
  users          User[]
  patients       Patient[]
  services       Service[]
  appointments   Appointment[]
  invoices       Invoice[]
  files          FileAttachment[]
  auditLogs      AuditLog[]
  notifications  Notification[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model User {
  id           String        @id @default(cuid())
  clinicId     String
  clinic       Clinic        @relation(fields: [clinicId], references: [id])
  email        String        @unique
  passwordHash String
  firstName    String
  lastName     String
  role         Role
  phone        String?
  status       String        @default("active")
  schedules    StaffSchedule[]
  appointments Appointment[]  @relation("DentistAppointments")
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model Patient {
  id             String        @id @default(cuid())
  clinicId       String
  clinic         Clinic        @relation(fields: [clinicId], references: [id])
  firstName      String
  lastName       String
  gender         String?
  dateOfBirth    DateTime?
  email          String?
  phone          String?
  address        String?
  allergies      String?
  medicalHistory String?
  notes          String?
  attachments    FileAttachment[]
  appointments   Appointment[]
  invoices       Invoice[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Service {
  id        String   @id @default(cuid())
  clinicId  String
  clinic    Clinic   @relation(fields: [clinicId], references: [id])
  name      String
  code      String?
  price     Decimal  @db.Money
  currency  String   @default("SAR")
  durationM Int      @default(30)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model StaffSchedule {
  id         String   @id @default(cuid())
  clinicId   String
  clinic     Clinic   @relation(fields: [clinicId], references: [id])
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  weekday    Int      // 0-6
  startTime  String   // HH:mm
  endTime    String
  breakSlots Json?    // list of { start, end }
  exceptions Json?    // vacations, overrides
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Appointment {
  id           String    @id @default(cuid())
  clinicId     String
  clinic       Clinic    @relation(fields: [clinicId], references: [id])
  patientId    String
  patient      Patient   @relation(fields: [patientId], references: [id])
  dentistId    String
  dentist      User      @relation("DentistAppointments", fields: [dentistId], references: [id])
  serviceId    String
  service      Service   @relation(fields: [serviceId], references: [id])
  room         String?
  startAt      DateTime
  endAt        DateTime
  status       String    @default("scheduled")
  notes        String?
  invoice      Invoice?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Invoice {
  id           String        @id @default(cuid())
  clinicId     String
  clinic       Clinic        @relation(fields: [clinicId], references: [id])
  patientId    String
  patient      Patient       @relation(fields: [patientId], references: [id])
  appointmentId String?
  appointment  Appointment?  @relation(fields: [appointmentId], references: [id])
  status       InvoiceStatus @default(DRAFT)
  currency     String        @default("SAR")
  totalAmount  Decimal       @db.Money
  balanceDue   Decimal       @db.Money
  issuedAt     DateTime
  dueAt        DateTime?
  items        InvoiceItem[]
  payments     Payment[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model InvoiceItem {
  id         String   @id @default(cuid())
  invoiceId  String
  invoice    Invoice  @relation(fields: [invoiceId], references: [id])
  serviceId  String?
  service    Service? @relation(fields: [serviceId], references: [id])
  description String
  quantity   Int      @default(1)
  unitPrice  Decimal  @db.Money
  total      Decimal  @db.Money
}

model Payment {
  id             String        @id @default(cuid())
  invoiceId      String
  invoice        Invoice       @relation(fields: [invoiceId], references: [id])
  amount         Decimal       @db.Money
  currency       String        @default("SAR")
  status         PaymentStatus @default(PENDING)
  method         String        // e.g., cash, card, provider name
  providerRef    String?
  processedAt    DateTime?
  metadata       Json?
  createdAt      DateTime @default(now())
}

model FileAttachment {
  id          String   @id @default(cuid())
  clinicId    String
  clinic      Clinic   @relation(fields: [clinicId], references: [id])
  patientId   String?
  patient     Patient? @relation(fields: [patientId], references: [id])
  uploadedBy  String
  uploader    User     @relation(fields: [uploadedBy], references: [id])
  entityType  String   // patient, appointment, invoice
  entityId    String
  url         String
  mimeType    String?
  sizeBytes   Int?
  createdAt   DateTime @default(now())
}

model AuditLog {
  id         String   @id @default(cuid())
  clinicId   String
  clinic     Clinic   @relation(fields: [clinicId], references: [id])
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String   // e.g., PATIENT_VIEWED
  entityType String
  entityId   String?
  ipAddress  String?
  metadata   Json?
  createdAt  DateTime @default(now())
}

model Notification {
  id           String   @id @default(cuid())
  clinicId     String
  clinic       Clinic   @relation(fields: [clinicId], references: [id])
  type         String   // email, sms
  channel      String   // provider
  template     String
  payload      Json
  status       String   @default("pending")
  scheduledFor DateTime?
  sentAt       DateTime?
  error        String?
  createdAt    DateTime @default(now())
}
```

Let me know when to proceed to Phase 2 (backend setup).

## Phase 2 – Backend Setup (Initial API Surface)
This phase introduces a working NestJS backend with Prisma, JWT auth, and the first tenant-aware endpoints.

### 1. Repository layout (new)
```
backend/
  package.json, tsconfig*.json, nest-cli.json
  .env.example ← copy to .env and fill DB/JWT secrets
  prisma/schema.prisma ← normalized multi-tenant schema
  src/
    app.module.ts ← wires Config, Prisma, Auth, Clinics, Users modules
    auth/ ← signup, login, invite flows, JWT strategy
    clinics/ ← clinic profile endpoints scoped by tenant
    users/ ← current user + staff directory
    common/guards,decorators ← JwtAuthGuard + RBAC RolesGuard helpers
    prisma/ ← PrismaService singleton
```

### 2. Environment & install instructions
Run these from the repo root:
1. `cd backend`
2. `cp .env.example .env` and update secrets + `DATABASE_URL`.
3. Install deps: `npm install`
4. Apply schema + generate client: `npx prisma migrate dev --name init`
5. Start dev server: `npm run start:dev` (launches NestJS with live reload on http://localhost:3000/api)

### 3. Implemented endpoints (v0)
| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | Creates a clinic + owner user, returns JWT | Public |
| POST | `/api/auth/login` | Returns JWT for existing user | Public |
| POST | `/api/auth/invite` | Owners/Admins invite staff; returns token for email/SMS | Bearer (Owner/Admin) |
| POST | `/api/auth/accept-invite` | Staff completes onboarding via invite token | Public |
| GET | `/api/clinics/me` | Logged-in user’s clinic profile | Bearer |
| PATCH | `/api/clinics/me` | Update clinic name/locale/timezone | Bearer (Owner/Admin) |
| GET | `/api/users/me` | Returns profile decoded from JWT | Bearer |
| GET | `/api/users` | Lists all staff in current clinic (for schedule assignment later) | Bearer |

> **Security note:** The frontend should store the returned JWT inside an HttpOnly cookie when we build Phase 4. For now the API accepts a standard `Authorization: Bearer <token>` header so the endpoints are easy to exercise via REST clients/Postman.

### 4. RBAC & tenant enforcement
- Every table in `schema.prisma` has a `clinicId` foreign key; services only query/update within the authenticated user’s clinic ID.
- `JwtAuthGuard` authenticates requests; `RolesGuard` enforces route-level permissions via the `@Roles()` decorator.
- Invites default to `72` hours expiry (configurable via `INVITE_EXPIRY_HOURS`). Tokens are random base64url strings that can be embedded in future email templates.

### 5. Next steps preview
Phase 3 will add appointments, patient records, billing, staff schedules, and audit logging endpoints that layer on top of these base modules.
