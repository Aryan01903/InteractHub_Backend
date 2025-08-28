# 🧾 InteractHub Backend (API)

**A multi-tenant SaaS backend** for a real-time whiteboard collaboration and Video Conference web app built with the **MERN** stack.

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

| Method | Endpoint                   | Description                  | Payload
|--------|----------------------------|------------------------------|---------
| POST   | `/api/auth/register`       | Send OTP to email            | name, email, password, tenantName(admin), tenantId(member)                 |
| POST   | `/api/auth/verify-otp`     | Verify OTP, complete signup  | email, role, otp                                                            |
| POST   | `/api/auth/login`          | Login using passwordHash     | email, password                                                             |
| POST   | `/api/auth/accept-invite`  | Accept invite + join tenant  | email, name , invite token, password                                        |
| POST   | `/api/auth/sendInvite`     | Invitation for member/admin  | email, role |
| GET    | `/api/auth/members`        | Get the all joinee of Tenant | token |
| DELETE | `/api/auth/deleteMember`   | Delete the Members of Tenant | name, email |

---

### 🎥 Video

| Method | Endpoint                 | Description                       |
|--------|--------------------------|-----------------------------------|
| POST   | `/api/videoCall/create`  | To create and Schedule Video Call |

---

### 📝 Whiteboard

| Method | Endpoint                                        | Description                       |
|--------|-------------------------------------------------|-----------------------------------|
| POST   | `/api/whiteboard/create`                        | Create new board                  |
| PUT    | `/api/whiteboard/update/:id`                    | Update whiteboard data            |
| GET    | `/api/whiteboard/get`                           | List all boards (tenant-specific) |
| GET    | `/api/whiteboard/get/:id`                       | Get one whiteboard by ID          |
| GET    | `/api/whiteboard/get/:id/versions`              | Fetch board version history       |
| GET    | `/api/whiteboard/get/:id/restore/:versionIndex` | Restore board to previous version |

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

---

## Deployment

**API available on :- https://boardstack.onrender.com** 
