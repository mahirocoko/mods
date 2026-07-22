# คู่มือใช้งาน Mahiro Letta Mods

Mahiro Letta Mods คือชุด runtime tools สำหรับ Letta Code ที่ช่วยดูแลบริบท เป้าหมาย หลักฐาน การออกแบบ การประสานหลาย agent และการเชื่อมต่อ MCP แต่ละตัวมีเจ้าของงานชัดเจน จึงไม่ควรใช้แทนกันหรือโยนทุกงานเข้า workflow ใหญ่โดยไม่จำเป็น

หลักง่าย ๆ คือ **งานเล็กใช้ให้น้อย งานซับซ้อนค่อยเพิ่มชั้นประสานงาน** ถ้าแก้ไฟล์เดียวแล้วรัน test จบ ก็ไม่ต้องสร้าง Goal หรือ Execution Run ขึ้นมา แต่ถ้างานมีหลาย lane มี human gate หรือต้องเก็บหลักฐานเพื่อปิดงาน ค่อยหยิบ mod ที่ตรงกับปัญหามาใช้

## เริ่มต้นเร็ว

ติดตั้งจาก GitHub:

```bash
letta install git:github.com/mahirocoko/mods
```

อัปเดตชุดที่ติดตั้งไว้แล้ว:

```bash
letta mods update git:github.com/mahirocoko/mods
```

ถ้าเริ่มจาก local checkout ให้ติดตั้งครั้งแรกด้วย:

```bash
pnpm install
pnpm check
pnpm mods:status
pnpm mods:install
```

หลังแก้ mod ใน checkout นี้ ให้รัน:

```bash
pnpm check
pnpm mods:update
```

รอให้คำสั่งจบก่อนรัน `/reload` และอย่ารัน Letta package install, update หรือ remove พร้อมกันหลายคำสั่ง

หลังติดตั้งหรืออัปเดต ให้รัน:

```text
/reload
```

ไฟล์ใต้ `~/.letta/mods/packages/` เป็น runtime copy อย่าแก้ตรงนั้น ให้แก้ใน repo แล้วติดตั้งใหม่เสมอ

## เลือกใช้ตัวไหนดี

| ถ้าต้องการ… | ใช้ mod |
| --- | --- |
| ให้ทุกข้อความมีเวลาท้องถิ่นที่เชื่อถือได้ | Mahiro User Timestamps |
| ตั้งเป้าหมาย มี DoD และกำหนด human gate เมื่อต้องให้ Mahiro ตรวจรับ | Mahiro Goal |
| เก็บ Git state และผล check เพื่อใช้อ้างอิง | Mahiro Code Evidence |
| จัด flow งานออกแบบและขออนุมัติ direction/review | Mahiro UX Workflow |
| เลือกทางค้นโค้ดแบบ semantic, exact หรือ outline | Mahiro Code Map |
| ประสานหลาย agent, CLI, worktree หรือ target | Mahiro Execution Run |
| ดูหรือเปิดการ rewrite คำสั่งผ่าน RTK | RTK Control |
| ดูสถานะ workspace, Git, context และ activity | Compact Statusline |
| ค้นและเรียก MCP tools แบบมี approval boundary | Lazy MCP Proxy |

## Slash command กับ model tool ต่างกันยังไง

- **Slash command** มีไว้ให้ Mahiro สั่งหรือดูสถานะโดยตรง เช่น `/mh-goal status` หรือ `/rtk doctor`
- **Model tool** มีไว้ให้ agent ใช้ระหว่างทำงาน เช่น `mh_collect_code_evidence` หรือ `mh_update_execution_run`

ปกติไม่ต้องพิมพ์ JSON ของ model tool เอง บอกสิ่งที่ต้องการกับ agent ได้เลย แล้วให้ agent เรียก tool พร้อม revision และ scope ที่ถูกต้อง

---

## 1. Mahiro User Timestamps

### ใช้เมื่อไร

เมื่อ host รองรับ turn events ตัวนี้จะทำงานอัตโนมัติกับทุก user turn จริง ช่วยให้ agent รู้เวลาท้องถิ่นและ timezone โดยไม่ต้องเดาจากเวลาของ server เหมาะกับงานที่อ้างถึง “วันนี้”, “เมื่อกี้”, deadline หรือเหตุการณ์ข้ามวัน

### ใช้อย่างไร

ไม่ต้องใช้คำสั่ง หลัง `/reload` แล้ว ถ้า host รองรับ turn events ข้อความใหม่จะมี `<user_timestamp>` แนบเข้ามาเอง

### ต้องรู้

- ข้อความระบบ เช่น Goal reminder จะไม่ถูกตีความว่าเป็นข้อความใหม่จาก Mahiro
- ถ้ามี timestamp อยู่แล้ว mod จะไม่เติมซ้ำ
- อย่าติดตั้ง timestamp handler ตัวอื่นให้ทำงานพร้อมกัน เพราะหนึ่ง turn ควรมีเจ้าของเวลาเพียงตัวเดียว

---

## 2. Mahiro Goal

### ใช้เมื่อไร

ใช้กับงานที่มีเป้าหมายชัด มีหลายเงื่อนไขก่อนเรียกว่าเสร็จ หรือต้องให้ Mahiro ตรวจรับ เช่น feature ใหญ่ การเปลี่ยน global config งาน visual และ release

งานเล็กไม่จำเป็นต้องมี Goal ถ้า agent ทำ แก้ และตรวจได้ในรอบสั้น ๆ ก็ทำงานต่อได้เลย

### วิธีใช้ที่แนะนำ

บอก agent เป็นภาษาปกติ เช่น:

```text
ช่วยตั้ง Goal สำหรับทำระบบ login ให้เสร็จ โดยต้องผ่าน test และให้ฉันตรวจหน้า UI ก่อนปิดงาน
```

เมื่อ Mahiro ขอหรืออนุมัติให้สร้าง Goal แล้ว agent จะใช้ `mh_get_goal`, `mh_create_goal` และ `mh_update_goal` จัดการให้เอง ไม่ต้องสร้างซ้ำด้วย slash command

ถ้าต้องการสร้าง Goal แบบง่ายด้วยตัวเอง:

```text
/mh-goal ทำระบบ login ให้เสร็จ
/mh-goal ทำระบบ login ให้เสร็จ --token-budget 50000
```

คำสั่งที่ใช้บ่อย:

```text
/mh-goal status
/mh-goal-status
/mh-goal pause
/mh-goal resume
/mh-goal verify criterion-02 UI ผ่านแล้ว
/mh-goal complete
/mh-goal clear
```

`/mh-goal-status` เปิด panel สั้น ๆ ได้แม้ agent กำลังทำงาน ส่วน `/mh-goal status` เหมาะกับการดูรายละเอียดเต็มตอน idle

### สถานะสำคัญ

- `pending` — งานหรือหลักฐานยังไม่ครบ
- `claimed` — agent ตรวจหลักฐานแล้วและขอปิด criterion ฝั่ง agent
- `verified` — Mahiro ยืนยัน criterion ฝั่ง human แล้ว
- `blocked` — ไปต่อไม่ได้จนกว่าจะแก้ blocker
- `complete` — ทุก required criterion ผ่านและไม่มี blocker เปิดอยู่

### ต้องรู้

- Agent ห้าม verify criterion ที่เป็นของ human
- ก่อน `claimed` ต้องมี evidence จริง
- `complete --force` เป็นทางลัดของมนุษย์ ใช้เฉพาะตอนตั้งใจข้าม audit
- Completed Goal แก้ต่อไม่ได้ ถ้าจะเปลี่ยน objective ให้ replace ด้วย revision ล่าสุด หรือ clear แล้วเริ่มใหม่

---

## 3. Mahiro Code Evidence

### ใช้เมื่อไร

ใช้ตอนต้องตอบให้ได้ว่า “โค้ดที่อ้างถึงคือชุดไหน” และ “check ที่บอกว่าผ่านผูกกับ HEAD ไหน” เหมาะกับการปิด Goal, ก่อน commit/release หรือหลังหลาย agent ส่งงานกลับมา

### คำสั่งสำหรับ Mahiro

```text
/mh-evidence collect /path/to/repo
/mh-evidence status /path/to/repo
/mh-evidence report /path/to/repo
/mh-evidence clear <revision> /path/to/repo
```

### Flow ที่ agent ควรใช้

1. `mh_collect_code_evidence` เก็บ branch, HEAD, base และแยก staged/unstaged/untracked ให้ชัด
2. รัน test, browser check หรือ native check ด้วย tool ที่เป็นเจ้าของงานนั้น
3. `mh_record_code_evidence` บันทึก summary ของผลที่ทำไปแล้ว
4. ใช้ `mh_update_goal` แนบ evidence ที่เลือกเข้า criterion

### ต้องรู้

- Code Evidence ไม่ได้รัน command ตามข้อความจาก agent ใช้เฉพาะ Git command แบบ fixed/read-only
- `mh_record_code_evidence` ไม่ได้พิสูจน์ว่าคำสั่งถูกรัน มันบันทึกผลจากงานที่เกิดขึ้นแล้ว จึงต้องให้ check owner ทำงานก่อน
- พอ collect ใหม่ record ชุดเก่าจะกลายเป็น stale เพื่อกันเอาหลักฐานจาก working tree คนละชุดมาใช้
- `evidence_ready` แปลว่าหลักฐานครบพอให้ส่งต่อ ไม่ได้แปลว่า Mahiro ตรวจรับแล้ว
- อย่าใส่ secret, raw log ยาว ๆ หรือ diff เต็มก้อนลงใน summary/reference

---

## 4. Mahiro UX Workflow

### ใช้เมื่อไร

ใช้กับงาน UX/UI ที่ต้องมี frame, research, concept, direction approval, implementation handoff และ review หลายรอบ เหมาะกับ redesign หรือหน้าสำคัญที่ไม่ควรกระโดดจากโจทย์ไปเขียนโค้ดทันที

### Flow หลัก

```text
frame → discovery → design → direction_approval
→ handoff → implementation → review → complete
```

Agent ใช้ `mh_create_ux_workflow` และ `mh_update_ux_workflow` เก็บ artifact ตาม stage และต้องเรียก skill `frontend-design` จริงก่อนบันทึก brief

คำสั่งที่ Mahiro ใช้อนุมัติ:

```text
/mh-ux status
/mh-ux approve direction <revision> <concept-id> [note]
/mh-ux reject direction <revision> <concept-id> [note]
/mh-ux approve review <revision> [note]
/mh-ux reject review <revision> [note]
/mh-ux reopen <revision> [note]
```

### ต้องรู้

- UX Workflow เป็น coordinator ไม่ได้ browse, research, design หรือ implement ให้เอง
- Brief ที่บันทึกไว้เป็น caller attestation ไม่ใช่หลักฐานว่า skill ถูกใช้ดีพอ
- Direction และ review approval เป็น human gate
- Review ได้ไม่เกิน 3 iterations
- UX complete ไม่ได้ทำให้ Goal complete ต้องแนบ UX/Code Evidence เข้า Goal แยกต่างหาก

---

## 5. Mahiro Code Map

### ใช้เมื่อไร

ใช้ตอน agent ต้องตัดสินใจว่าจะค้นโค้ดแบบไหนก่อนอ่านไฟล์จำนวนมาก ตัวนี้ไม่มี slash command เพราะออกแบบมาเป็น model tool ชื่อ `mh_code_map`

Intent มีสามแบบ:

- `semantic` — หาแนวคิดหรือ flow ที่ไม่รู้ชื่อ symbol ชัด ๆ แล้ว route ไป `ccc`
- `exact` — หา path, symbol หรือข้อความตรงตัว แล้ว route ไป exact search เช่น `rg`
- `outline` — ขอรายการ symbol/โครงสร้างจาก outline tool ที่มีอยู่ หรือแนะนำ targeted read ขนาดเล็ก

ตัวอย่างโจทย์:

```text
หาว่า auth flow อยู่ตรงไหน แต่ยังไม่รู้ชื่อไฟล์
หา exact symbol ชื่อ createSession
ขอดู outline ของ service นี้ก่อนอ่านทั้งไฟล์
```

### ต้องรู้

- Code Map ไม่ได้อ่าน repo, run search หรือสร้าง outline เอง มันคืน navigation guidance เท่านั้น
- `navigation_entries` เป็นข้อมูลที่ caller บอกมา ไม่ใช่หลักฐานว่า search เกิดขึ้นจริง
- ค่า `large_read` แค่ขยายคำแนะนำการอ่าน ไม่ใช่ permission boundary
- หลังแก้โค้ดแล้วต้องใช้ Code Evidence หรือ check owner อื่น ไม่ใช่ Code Map

---

## 6. Mahiro Execution Run

### ใช้เมื่อไร

ใช้เมื่อ implementation มีหลาย lane หรือ ownership เริ่มซับซ้อน เช่น:

- มี main agent กับ subagent หลายตัว
- ใช้ Direct CLI หรือ human lane ร่วมกัน
- มีหลาย worktree/target และต้องกัน writer ชนกัน
- งานข้ามหลาย turn และต้องส่ง handoff เข้า Code Evidence

ถ้าเป็นงานแก้ไฟล์เดียวหรือ agent เดียวจบในรอบสั้น ให้ข้ามตัวนี้ไปเลย

### Flow หลัก

```text
plan → ready → active → reported → handed_off
```

Agent ใช้ `mh_create_execution_run` วาง target/lane แล้วอัปเดตด้วย `mh_update_execution_run` ทุก mutation ต้องส่ง run ID และ revision ล่าสุด

Mahiro ใช้คำสั่งเหล่านี้เพื่อดูหรือหยุด run:

```text
/mh-run status
/mh-run abandon <revision> [note]
/mh-run clear <revision>
```

### ต้องรู้

- Target ที่เขียนได้มี writer ได้หนึ่ง lane ส่วน reader มีได้หลาย lane
- Execution Run ไม่ได้เปิด agent, เลือก model, ส่ง prompt, ตรวจ process หรือ enforce filesystem permission
- Report, session ref, changed path และ check เป็น caller metadata
- `reported` แปลว่ามีรายงานถูกบันทึก ไม่ได้แปลว่างานผ่าน
- `handed_off` แปลว่าส่ง scope ต่อแล้ว ไม่ได้แปลว่า verified, merged หรือ complete
- หลัง handoff ต้อง collect Code Evidence ใหม่ แล้วค่อยแนบเข้า Goal

---

## 7. RTK Control

### ใช้เมื่อไร

ใช้เพื่อดูประโยชน์ของ RTK และคุมว่าจะให้ mod แนะนำหรือ rewrite shell command แค่ไหน ค่าเริ่มต้นคือ `off` จึงไม่เปลี่ยน command ใด ๆ จนกว่า Mahiro จะเปิดเอง

เริ่มจากตรวจสถานะ:

```text
/rtk status
/rtk doctor
/rtk gain
/rtk projects 7d
/rtk rewrite git diff
```

โหมดที่มี:

```text
/rtk mode off
/rtk mode suggest
/rtk mode rewrite-safe
/rtk mode rewrite-rtk
```

- `off` — ไม่ทำอะไร
- `suggest` — บันทึกโอกาส rewrite แต่ยังรัน command เดิม
- `rewrite-safe` — rewrite เฉพาะ read-only allowlist ที่ค่อนข้าง conservative
- `rewrite-rtk` — ใช้ผลจาก `rtk rewrite` กว้างกว่า ต้องเปิดโดยตั้งใจ

ตรวจ activity ล่าสุดได้ด้วย:

```text
/rtk log
/rtk log 20
/rtk log clear
```

### ต้องรู้

- Mod นี้ไม่ติดตั้งหรือแก้ global settings hook
- Recent log อาจมี path, URL หรือ argument จาก command เก็บได้สูงสุด 20 รายการ ถ้ามีข้อมูลอ่อนไหวให้ clear
- ถ้าไม่มี `rtk` ตัว mod ยังใช้ดูสถานะ/diagnostic ได้ แต่ rewrite และ gain บางส่วนจะไม่พร้อม

---

## 8. Compact Statusline

### ใช้เมื่อไร

ตัวนี้ทำงานอัตโนมัติและแสดง context ที่ต้องเหลือบดูบ่อย เช่น workspace, Git branch/dirty state, conversation activity, context usage, MemFS, RTK, model, reasoning และ backend

ไม่ต้องมี slash command ถ้า host รองรับ panel ก็จะเห็นแถว statusline หลัง `/reload`

### ต้องรู้

- ข้อมูล Git, memory, reflection และ RTK refresh ทุก 10 วินาที ไม่ใช่ทุก millisecond
- Activity จาก turn, LLM, tool และ compaction เป็นสถานะชั่วคราว
- ถ้า host ไม่มี `ui.panels` จะไม่มี statusline และ diagnostics อาจมี warning เรื่อง panel capability ซึ่งไม่เท่ากับ mod พัง
- ถ้า statusline หายหลังแก้ source ให้ติดตั้ง package ใหม่แล้ว `/reload` แทนการแก้ installed copy

---

## 9. Lazy MCP Proxy

### ใช้เมื่อไร

ใช้เมื่อต้องค้นหรือเรียก MCP tools โดยไม่เอา remote tools ทั้งหมดมา register ตรง ๆ ใน Letta ตัว proxy แยก cached read ออกจาก live process/network action ชัดเจน

เริ่มจากดู config และ cache:

```text
/mcp-proxy status
/mcp-proxy setup
/mcp-proxy tools [server]
/mcp-proxy search <query>
/mcp-proxy describe <tool>
```

ถ้าต้องเชื่อมต่อหรือเรียก tool จริง:

```text
/mcp-proxy reconnect <server>
/mcp-proxy call <tool> [json-args]
/mcp-proxy disconnect [server|all]
```

Agent ควรใช้ `mcp_proxy` ดู cached metadata ก่อน แล้วค่อยใช้ `mcp_proxy_live` สำหรับ `reconnect`, `call` หรือ `disconnect`

Config อยู่ที่:

```text
~/.letta/mcp.json
<project>/.mcp.json
<project>/.letta/mcp.json
```

### ต้องรู้

- Live action ผ่าน model tool `mcp_proxy_live` จะขอ approval ตาม policy โดย default ส่วน slash command เป็นคำสั่งที่ Mahiro สั่งโดยตรง
- Project config เปิด `auto` เองไม่ได้ เว้นแต่ cwd อยู่ใต้ trusted root ที่ประกาศใน global config
- ถ้า host ไม่มี permissions capability จะไม่มี model-callable live tool
- อย่าใส่ token หรือ secret ลงใน tool arguments เพราะผลลัพธ์อาจเข้า conversation transcript
- OAuth, MCP resources และการ register remote tool ทุกตัวตรง ๆ ยังอยู่นอก scope

---

## ตัวอย่าง workflow ที่ใช้บ่อย

### งานแก้เล็ก ๆ

```text
Code Map (ถ้าหาที่ไม่เจอ) → แก้โค้ด → รัน focused check
→ Code Evidence เฉพาะเมื่อจำเป็นต้องปิด acceptance
```

ไม่ต้องสร้าง Goal หรือ Execution Run โดยอัตโนมัติ

### Feature ที่มี human gate

```text
Mahiro Goal → วางแผนงาน → implement → Code Evidence
→ agent claim criterion → Mahiro verify → Goal complete
```

### งานหลาย agent หรือหลาย worktree

```text
Mahiro Goal → Execution Run → external lanes report
→ handed_off → fresh Code Evidence → Goal attachment
→ human verification → complete
```

### งาน UX/UI เต็ม flow

```text
Mahiro Goal → UX Workflow → frontend-design brief
→ Mahiro approve direction → implementation
→ Code Evidence + UX review → Mahiro approve review
→ attach เข้า Goal → complete
```

## State และความปลอดภัย

State หลักจะอยู่ใต้ `~/.letta/mods/` ไม่ได้อยู่ใน source repo:

```text
~/.letta/mods/mahiro-goal.state.json
~/.letta/mods/mahiro-code-evidence.state.json
~/.letta/mods/mahiro-ux-workflow.state.json
~/.letta/mods/mahiro-execution-run.state.json
~/.letta/mods/rtk-control.state.json
~/.letta/mcp-proxy/
```

ไฟล์ workflow ใช้ atomic write, mode `0600`, revision guard และ mutation lock ถ้าเจอ lock อย่ารีบ `unlock --force` แค่เพราะมันเก่า ต้องเช็กก่อนว่าไม่มี process อื่นกำลังเขียน state อยู่จริง

ถ้า mod ทำให้ Letta เปิดไม่ได้ ให้เข้าโหมดกู้ระบบก่อน:

```bash
letta --no-mods
# หรือ
LETTA_DISABLE_MODS=1 letta
```

จากนั้นค่อยตรวจ package, source และ diagnostics อย่าลบ state หรือ backup ทิ้งเพื่อให้ error หาย เพราะข้อมูลพวกนั้นมักเป็นหลักฐานที่ใช้หาสาเหตุได้ดีที่สุด

## คำถามที่เจอบ่อย

### ต้องใช้ทุก mod ทุกครั้งไหม

ไม่ต้อง User Timestamps กับ Statusline ทำงานเป็นพื้นหลัง ส่วน Goal, UX Workflow, Execution Run, Code Evidence, RTK และ MCP Proxy เลือกใช้ตามงาน

### `handed_off` หรือ `evidence_ready` แปลว่างานเสร็จหรือยัง

ยัง `handed_off` หมายถึงส่งข้อมูลประสานงานต่อแล้ว ส่วน `evidence_ready` หมายถึงมีหลักฐานพอให้ Goal พิจารณา ทั้งคู่ไม่ใช่ human acceptance

### เริ่ม Goal ใช้คำสั่งไหน

ใช้ `/mh-goal` สำหรับคำสั่งของ Mahiro ส่วน agent จะใช้ `mh_get_goal`, `mh_create_goal` และ `mh_update_goal` ระหว่างทำงาน

### Agent Halo อยู่ตรงไหน

Agent Halo ไม่ได้อยู่ใน package นี้ เพราะมี bridge, desktop app และ release lifecycle ของตัวเอง Source หลักอยู่ที่ repository `agent-halo`
