# 🧾 CollabBoard Backend

**A multi-tenant SaaS backend** for a real-time whiteboard collaboration app built with the **MERN** stack.

---

## 🚀 Features

- 🔐 **Authentication**
  - OTP-based signup via email (`nodemailer`)
  - Password-based secure signin (`bcrypt` + `JWT`)

- 🏢 **Multi-Tenant Support**
  - Each user belongs to one tenant
  - Admins can create **only one tenant** per account

- 🧑‍🤝‍🧑 **User Roles & Invites**
  - Roles: `admin`, `member`
  - Admins can invite users via **token-based email invite**

- 📜 **Audit Logs**
  - Tracks key actions (whiteboard edits, tenant creation, etc.)

- 🎨 **Whiteboard Collaboration**
  - Real-time updates using `Socket.IO`
  - Version tracking & restore capability


---

## 📡 API Endpoints

### 🔐 Auth

| Method | Endpoint                   | Description                 |
|--------|----------------------------|-----------------------------|
| POST   | `/api/auth/send-otp`       | Send OTP to email           |
| POST   | `/api/auth/register`       | Verify OTP, complete signup |
| POST   | `/api/auth/login`          | Login using passwordHash    |
| POST   | `/api/auth/accept-invite`  | Accept invite + join tenant |

### 🏢 Tenant

| Method | Endpoint              | Description                  |
|--------|-----------------------|------------------------------|
| POST   | `/api/tenants/create` | Create tenant *(Admin only)* |

### 📩 Invites

| Method | Endpoint              | Description                 |
|--------|-----------------------|-----------------------------|
| POST   | `/api/invites/send`   | Send invite *(Admin only)*  |
| POST   | `/api/invites/resend` | Resend expired invite email |

### 🧾 Audit Logs

| Method | Endpoint         | Description        |
|--------|------------------|--------------------|
| GET    | `/api/auditLogs` | View audit history |

### 🧱 Whiteboard

| Method | Endpoint                                        | Description                       |
|--------|-------------------------------------------------|-----------------------------------|
| POST   | `/api/whiteboard/create`                        | Create new board                  |
| PUT    | `/api/whiteboard/update/:id`                    | Update whiteboard data            |
| GET    | `/api/whiteboard/get`                           | List all boards (tenant-specific) |
| GET    | `/api/whiteboard/get/:id`                       | Get one whiteboard by ID          |
| GET    | `/api/whiteboard/get/:id/versions`              | Fetch board version history       |
| GET    | `/api/whiteboard/get/:id/restore/:versionIndex` | Restore board to previous version |

---

## 🔌 Real-Time Collaboration

- Clients connect to Socket.IO server
- Emit `joinBoard` event with board ID
- On drawing, emit `whiteboardUpdate`
- All users in same board room receive updates instantly

---

## 🛠 Tech Stack

| Area     | Tech Used               |
|----------|-------------------------|
| Backend  | Express.js (Node.js)    |
| Auth     | JWT, bcrypt, nodemailer |
| Database | MongoDB + Mongoose      |
| Realtime | Socket.IO               |
| Email    | Gmail SMTP (nodemailer) |

---

## 🧑‍💻 Author

**Aryan Kumar Shrivastav**

If you liked this project or have suggestions, feel free to ⭐ it or open a pull request!
