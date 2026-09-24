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
| จำ context window และ reasoning effort แยกตาม model | Mahiro Model Profiles |
| ดูว่า Letta main/subagent ในแต่ละ Herdr Space กำลังทำงาน รอ input หรือเสร็จแล้ว | Mahiro Herdr Lifecycle |
| ตั้งเป้าหมาย มี DoD และกำหนด human gate เมื่อต้องให้ Mahiro ตรวจรับ | Mahiro Goal |
| เก็บ Git state และผล check เพื่อใช้อ้างอิง | Mahiro Code Evidence |
| จัด flow งานออกแบบและขออนุมัติ direction/review | Mahiro UX Workflow |
| เลือกทางค้นโค้ดแบบ semantic, exact หรือ outline | Mahiro Code Map |
| ประสานหลาย agent, CLI, worktree หรือ target | Mahiro Execution Run |
| ดูหรือเปิดการ rewrite คำสั่งผ่าน RTK | RTK Control |
| ดูสถานะ workspace, Git, context และ activity | Compact Statusline |
| ค้นและเรียก MCP tools แบบมี approval boundary | Lazy MCP Proxy |
| กันการอ่านไฟล์ลับผ่าน Letta Code | [Mahiro Secret-Read Guard](../MOD.md#mahiro-secret-read-guard) |
| กัน Letta attribution ใน commit | [Commit Attribution Guard](../README.md#commit-and-voice-hook-migration) |
| เสียงเมื่อจบ turn | Finish Voice (`turn_end`) |

## Slash command กับ model tool ต่างกันยังไง

- **Slash command** มีไว้ให้ Mahiro สั่งหรือดูสถานะโดยตรง เช่น `/mh-goal status` หรือ `/rtk doctor`
- **Model tool** มีไว้ให้ agent ใช้ระหว่างทำงาน เช่น `mh_code_evidence` action `collect` หรือ `mh_execution_run` operation `update`

ปกติไม่ต้องพิมพ์ JSON ของ model tool เอง บอกสิ่งที่ต้องการกับ agent ได้เลย แล้วให้ agent เรียก tool พร้อม revision และ scope ที่ถูกต้อง

---

## Mahiro Herdr Lifecycle

ถ้าเปิด Letta Code อยู่ใน Herdr mod นี้จะทำงานเอง ไม่ต้องใช้ command เพิ่ม
โดยจะส่งเฉพาะสถานะรวมของ main agent กับ subagent ไปยัง local Herdr socket เช่น
`working`, `blocked`, `idle`, จำนวน child ที่กำลังรัน และชนิดของ subagent
รวมถึง model, reasoning effort, provider identity ที่ยืนยันได้ และ context meter
แบบย่อสำหรับ companion Mahiro Herdr Sidebar โดยไม่เดา provider จากชื่อ model
runtime alias `chatgpt-plus-pro` กับ handle/provider `openai-codex` จะ normalize
เป็น sidebar token `openai-codex` ค่าเดียวตาม public model contract ของ Letta
ถ้า event ถัดมาส่ง model เดิมแต่ขาด provider/effort จะเก็บหลักฐานชุดล่าสุดไว้
จนกว่า model key หรือ provider เปลี่ยนแบบ explicit หรือ conversation ถูกปิด/reset
ผลลัพธ์เต็ม, prompt, task description และ tool output จะไม่ถูกส่งไป Herdr

เมื่อ companion sidebar ติดตั้งและมี config snapshot ที่ถูกต้อง ตัว statusline
controller จะ refresh normalized Codex cache ให้ sidebar ด้วย แม้ปิดแถว quota
ใน statusline อยู่ การเก็บ cache กับการแสดงผลจึงแยกจากกันและไม่ทำให้แถวที่ปิดไว้โผล่กลับมา
หลัง cycle ไหนเขียน cache สำเร็จ จะเรียก public sidebar refresh แบบ bounded หนึ่งครั้ง
เพื่อไม่ให้ quota TTL ที่สั้นและซื่อตรงหายระหว่าง pane idle หรือ turn ที่ยาว

ตั้งแต่ v0.10.0 Mods จะไม่เก็บหรือแสดง Agy quota แล้ว เพราะ Agy CLI 1.2.2+
ไม่เปิด local CSRF contract แบบเดิม หากต้องการแสดง Agy ใน sidebar ต้องให้
external หรือ Agy-native producer เขียนข้อมูลตาม public sidebar protocol แทน

สถานะ `done` เป็นหน้าที่ของ Herdr: เมื่อ Letta รายงาน `idle` ใน pane ที่ยังไม่
ถูกเปิดดู Herdr จะเก็บ Done ไว้ให้ ถ้าเปิด Letta นอก Herdr mod นี้จะ no-op
และไม่เปลี่ยนการทำงานของ session

หลัง update bundle ให้ `/reload` ทุก Letta session ที่เปิดอยู่ ถ้า Herdr ไม่เห็น
สถานะ ให้เช็กก่อนว่า session นั้นถูกเปิดจาก Herdr และมี `HERDR_ENV=1`,
`HERDR_SOCKET_PATH`, `HERDR_PANE_ID` ครบ

ถ้าต้อง isolate ปัญหาโดยไม่ปิด mod bundle ทั้งชุด ใช้ per-entry manager ได้เลย:

```bash
pnpm mods:entry status
pnpm mods:entry disable herdr
pnpm mods:entry enable herdr
```

ชื่อที่ใช้ได้คือ `timestamps`, `model-profiles`, `herdr`, `goal`, `evidence`, `ux`, `code-map`,
`execution`, `rtk`, `statusline` และ `mcp` ทุกครั้งที่เปลี่ยนสถานะต้อง
`/reload` ใน session ที่เปิดอยู่ ตัว manager จะไม่แก้ `packages.json`, ไม่ลบ
state และไม่ปิด entry อื่นใน bundle

ไฟล์ `mahiro-mcp-proxy.js.disabled` ที่มีอยู่เดิมเป็นสำเนา legacy direct source
ไม่ใช่ switch ของ packaged MCP ตัวใหม่ `mcp` จะใช้ไฟล์
`mahiro-mcp-proxy.disabled`

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

## 2. Mahiro Model Profiles

### ใช้เมื่อไร

ใช้เมื่อสลับ model แล้วอยากให้ context window และ reasoning effort ที่ตั้งไว้
ถูกนำไปใช้พร้อมกันโดยไม่ต้องตั้งค่าซ้ำทุกครั้ง ตัวนี้เป็น preference ต่อ agent
ไม่ใช่ model router และไม่เปลี่ยน provider ให้เอง

### ใช้อย่างไร

ดู profile และค่าปัจจุบัน:

```text
/mh-model-profile list
```

บันทึก profile สำหรับ GPT-6 Sol:

```text
/mh-model-profile set openai-codex/gpt-6-sol 272000 high GPT-6 Sol
```

สลับไปใช้ profile จาก handle หรือ label:

```text
/mh-model-profile switch GPT-6 Sol
/mh-model-profile switch GPT-6 Sol --agent
```

ลบ profile:

```text
/mh-model-profile remove GPT-6 Sol
```

การ switch มีผลใน turn ถัดไป และค่า explicit ที่ส่งให้ model tool จะ override
profile ที่บันทึกไว้ การเปลี่ยนแบบ `conversation` เป็นค่าเริ่มต้นและกระทบเฉพาะ
thread ปัจจุบัน ส่วน `--agent` เปลี่ยนค่า default ของ agent

### ต้องรู้

- Profile เก็บใน agent-scoped MemFS ไม่ได้เก็บใน checkout ของ project
- `context_window` ต้องเป็น positive integer และ reasoning ต้องเป็น tier ที่ host รองรับ
- ถ้าไม่มี profile ตรงกัน ตัวนี้ยังสลับ model ได้ แต่ค่าที่ไม่ระบุจะใช้ provider default
- Profile ไม่ได้ยืนยันว่า provider รองรับ context window หรือ reasoning tier ที่เลือก
- หลัง update bundle ให้ `/reload` ใน session ที่เปิดอยู่

---

## 3. Mahiro Goal

### ใช้เมื่อไร

ใช้กับงานที่มี mission ชัด มีหลายเงื่อนไขก่อนเรียกว่าเสร็จ หรือต้องให้ Mahiro ตรวจรับ เช่น feature ใหญ่ การเปลี่ยน global config งาน visual และ release

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
```

คำสั่งที่ใช้บ่อย:

```text
/mh-goal status
/mh-goal-status
/mh-goal list
/mh-goal move <goal-id> <revision>
/mh-goal pause
/mh-goal resume
/mh-goal rule add <revision> must ให้ Agy เป็นคนลงมือแก้ไฟล์ชุดนี้
/mh-goal rule update <revision> <rule-id> prefer เริ่มจากการแก้ที่เล็กที่สุดก่อน
/mh-goal rule remove <revision> <rule-id>
/mh-goal verify criterion-02 UI ผ่านแล้ว
/mh-goal complete
/mh-goal revise <revision> ปรับ objective ตาม direction ใหม่
/mh-goal clear
/mh-goal clear <goal-id> <revision>
```

`/mh-goal-status` เปิด panel สั้น ๆ ได้แม้ agent กำลังทำงาน ส่วน `/mh-goal status` เหมาะกับการดูรายละเอียดเต็มตอน idle โดยแยก Mission, Current, Progress, Goal Rules, Definition of Done, Plan, Blockers และ Details เป็นกลุ่มชัดเจน label กับ ID ที่สั้นใช้ inline accent จาก Markdown theme ส่วน owner, requirement, status, evidence และ progress แยกด้วย semantic marker พร้อมข้อความกำกับ ค่าเนื้อหาที่ยาวใช้สีปกติเพื่อไม่ให้สีขาดเมื่อ terminal wrap ส่วน panel ใช้สีตามสถานะผ่าน public render context จึงไม่ฝัง ANSI escape ลงใน transcript

ตอบจบรอบหนึ่ง, checkpoint report, Execution Run ที่ `reported` หรือสถานะ Done ของ Herdr ไม่ได้แปลว่า Goal จบ Goal ที่ยัง active สามารถหยุดที่ checkpoint ได้ตามปกติ โดย status จะบอกว่าเหลืองานฝั่ง agent หรือกำลังรอ Mahiro ตรวจรับ

### Goal Rules

Rules ใช้เก็บข้อตกลงการทำงานชั่วคราวของ Goal นั้น เช่น “ให้ Agy เป็นคนลงมือ ส่วน main agent ตรวจ correctness” แต่ละ Goal มีได้ไม่เกิน 8 ข้อ ข้อละไม่เกิน 500 ตัวอักษร และมี 2 ระดับ:

- `must` — ข้อจำกัดของภารกิจที่ควรทำตาม ถ้าพบว่าฝ่าฝืนจนงานไปต่อไม่ได้ ให้เปิด blocker ตามปกติ
- `prefer` — ค่าเริ่มต้นหรือแนวทางที่อยากให้ใช้ การออกนอกแนวทางนี้ไม่ block completion เอง

Rules ไม่ใช่ DoD จึงไม่มีสถานะ claimed/verified และไม่นับใน progress ทั้งสองระดับแพ้ system, safety, permission, repo rules และคำสั่งล่าสุดจาก Mahiro เสมอ ถ้า direction เปลี่ยนให้แก้หรือลบ Rule เก่าแทนการฝืนทำตาม

Agent จัดการ Rules ผ่าน `mh_create_goal` และ action `add_rule`, `update_rule`, `remove_rule` ของ `mh_update_goal` หลัง Mahiro อนุมัติ scope แล้ว ทุก mutation ใช้ revision ล่าสุด ถ้า `revise_mission` ไม่ส่ง `rules` เข้ามา ชุดเดิมจะอยู่ต่อ แต่ถ้าส่ง `rules: []` จะล้างทั้งหมด ส่วน full replacement ที่ไม่ส่ง Rules จะเริ่มชุดใหม่แบบว่าง

### ย้าย Goal ไป conversation ใหม่

ถ้าเปิด conversation ใหม่แล้วอยากทำ Goal เดิมต่อ ให้ move Goal เข้ามาที่ conversation ใหม่แทนการ copy:

```text
/mh-goal list
/mh-goal move <goal-id> <revision>
```

ฝั่ง agent ใช้ `mh_update_goal` action `move_goal` หลัง Mahiro สั่งโดยตรง ปลายทางคือ conversation ที่เรียก action เสมอและต้องยังไม่มี Goal ระบบจะย้าย state ทั้งก้อนใน atomic write เดียว ทั้ง Goal ID, lifecycle, DoD/evidence, plan, Rules, workspace และ history จากนั้น conv เก่าจะอ่าน แก้ หรือรับ reminder ของ Goal นี้ไม่ได้อีก

ย้ายได้เฉพาะ conversation ของ agent เดิม ถ้า revision เก่า, ID ซ้ำ, ปลายทางมี Goal อยู่แล้ว หรือเป็น raw `default` lane คนละ workspace ระบบจะไม่แก้อะไรเลย สำหรับ conversation ปกติที่ cwd ต่างกัน ระบบจะเก็บ workspace ต้นทางไว้และขึ้น warning ใน reminder แทนการเปลี่ยน ownership เงียบ ๆ

### สถานะสำคัญ

- `pending` — งานหรือหลักฐานยังไม่ครบ
- `claimed` — agent ตรวจหลักฐานแล้วและขอปิด criterion ฝั่ง agent
- `verified` — Mahiro ยืนยัน criterion ฝั่ง human แล้ว
- `blocked` — ไปต่อไม่ได้จนกว่าจะแก้ blocker
- `complete` — แผนรอบปัจจุบันผ่านทุก required criterion และไม่มี blocker เปิดอยู่

### ต้องรู้

- Agent ห้าม verify criterion ที่เป็นของ human
- ก่อน `claimed` ต้องมี evidence จริง
- `complete --force` เป็นทางลัดของมนุษย์ ใช้เฉพาะตอนตั้งใจข้าม audit
- Goal คือ **living mission + bounded Rules + mutable plan**: ระหว่างทาง agent ใช้ `revise_mission` เพื่อปรับ objective, DoD, non-goals, Rules, phase หรือ next action ได้เมื่อ Mahiro เปลี่ยน direction; ทุกครั้งต้องมี revision ล่าสุดและสรุปสั้น ๆ ว่าเปลี่ยนเพราะอะไร
- Plan item ใช้ `pending`, `in_progress`, `done`, `blocked` จึงเพิ่ม ตัด หรือสลับงานระหว่างทางได้โดยไม่ต้องสร้าง Goal ใหม่
- Plan item เป็น coordination ที่แก้ได้ตลอด ไม่ใช่ gate ซ่อนของ completion; การปิดแผนยังยึด DoD และ blocker ที่ประกาศไว้
- `complete` ปิดเฉพาะแผนรอบนั้น ไม่ทำลาย mission; ถ้าจะทำต่อให้ `revise_mission` อย่างชัดเจนเพื่อ reopen แผน
- Agent ใช้ `mh_clear_goal` ได้เมื่อ Mahiro สั่ง clear โดยตรง พร้อม `expected_revision` และ runtime approval; มันลบ state จริง ไม่สร้าง Goal ปลอมเพื่อแทนคำสั่ง clear
- Goal ไม่มี token quota; state เก่าที่มีข้อมูล token budget จะถูกละทิ้ง Goal ที่เคย `budget_limited` จะกลับเป็น `active` และ Goal เก่าที่ยังไม่มี field `rules` จะอ่านเป็น `rules: []`
- `/mh-goal list` เป็น inventory สำหรับ Mahiro ที่แสดงเฉพาะ mission ของ agent ปัจจุบันซึ่งยังต้องจัดการ; current plan ที่ complete แล้วจะซ่อน แต่ยังดูจาก `/mh-goal status` ใน conversation ที่เป็นเจ้าของได้ ถ้าจะล้าง Goal จาก conversation เก่าต้องใช้ Goal ID และ revision ที่ตรงกัน และล้างข้าม agent ไม่ได้

---

## 4. Mahiro Code Evidence

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

1. `mh_code_evidence` action `collect` เก็บ branch, HEAD, base และแยก staged/unstaged/untracked ให้ชัด
2. รัน test, browser check หรือ native check ด้วย tool ที่เป็นเจ้าของงานนั้น
3. `mh_code_evidence` action `record` บันทึก summary ของผลที่ทำไปแล้ว
4. ใช้ `mh_update_goal` แนบ evidence ที่เลือกเข้า criterion

### ต้องรู้

- Code Evidence ไม่ได้รัน command ตามข้อความจาก agent ใช้เฉพาะ Git command แบบ fixed/read-only
- `mh_code_evidence` action `record` ไม่ได้พิสูจน์ว่าคำสั่งถูกรัน มันบันทึกผลจากงานที่เกิดขึ้นแล้ว จึงต้องให้ check owner ทำงานก่อน
- พอ collect ใหม่ record ชุดเก่าจะกลายเป็น stale เพื่อกันเอาหลักฐานจาก working tree คนละชุดมาใช้
- `evidence_ready` แปลว่าหลักฐานครบพอให้ส่งต่อ ไม่ได้แปลว่า Mahiro ตรวจรับแล้ว
- อย่าใส่ secret, raw log ยาว ๆ หรือ diff เต็มก้อนลงใน summary/reference

---

## 5. Mahiro UX Workflow

### ใช้เมื่อไร

ใช้กับงาน UX/UI ที่ต้องมี frame, research, concept, direction approval, implementation handoff และ review หลายรอบ เหมาะกับ redesign หรือหน้าสำคัญที่ไม่ควรกระโดดจากโจทย์ไปเขียนโค้ดทันที

### Flow หลัก

```text
frame → discovery → design → direction_approval
→ handoff → implementation → review → complete
```

Agent ใช้ `mh_create_ux_workflow` และ `mh_update_ux_workflow` เก็บ artifact ตาม stage โดยต้องระบุ design owner ให้ชัดว่า direction นี้มาจาก Mahiro, repo contract, model หรือ procedure ใดก่อนบันทึก brief ตัว mod ไม่เลือกเจ้าของแทนและ brief ที่บันทึกไว้ไม่ใช่หลักฐานว่า owner/procedure ทำงานสำเร็จ

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

## 6. Mahiro Code Map

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

## 7. Mahiro Execution Run

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

Agent ใช้ `mh_execution_run` operation `create` วาง target/lane แล้วอัปเดตด้วย operation `update` ทุก mutation ต้องส่ง run ID และ revision ล่าสุด

Mahiro ใช้คำสั่งเหล่านี้เพื่อดูหรือหยุด run:

```text
/mh-run status
/mh-run list
/mh-run abandon <revision> [note]
/mh-run clear <revision>
/mh-run abandon <run-id> <revision> [note]
/mh-run clear <run-id> <revision>
```

### ต้องรู้

- Target ที่เขียนได้มี writer ได้หนึ่ง lane ส่วน reader มีได้หลาย lane
- Execution Run ไม่ได้เปิด agent, เลือก model, ส่ง prompt, ตรวจ process หรือ enforce filesystem permission
- Report, session ref, changed path และ check เป็น caller metadata
- ถ้า lane เป็น `letta_subagent` ต้องบันทึก session ref เป็น `letta:agent=<agent-id>;conversation=<conversation-id>` เพื่อไม่ให้ `default` จากคนละ agent ชนกัน โดยค่านี้ยังไม่ใช่หลักฐานว่า agent เริ่มทำงานหรือส่งผลลัพธ์แล้ว
- `reported` แปลว่ามีรายงานถูกบันทึก ไม่ได้แปลว่างานผ่าน
- `handed_off` แปลว่าส่ง scope ต่อแล้ว ไม่ได้แปลว่า verified, merged หรือ complete
- หลัง handoff ต้อง collect Code Evidence ใหม่ แล้วค่อยแนบเข้า Goal
- `list` และคำสั่งที่ระบุ run ID เป็น human-only cleanup สำหรับ state เก่าข้าม conversation โดยต้องใช้ revision ล่าสุดเสมอ

---

## 8. RTK Control

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

## 9. Compact Statusline

### ใช้เมื่อไร

ตัวนี้ทำงานอัตโนมัติและแสดง context ที่ต้องเหลือบดูบ่อย เช่น workspace, Git branch/dirty state, background subagent ที่ยังทำงานอยู่, conversation activity, context usage, MemFS, RTK, model, reasoning และ backend

ถ้า host รองรับ panel ก็จะเห็นแถว statusline หลัง `/reload` โดยไม่ต้องเปิดเอง

ส่วน quota เปิดด้วย `/mh-usage codex on` และปิดด้วย `/mh-usage codex off` หรือ `/mh-usage off` เลือก meter แบบ `▰▰▱▱▱▱▱▱` ด้วย `/mh-usage bar` หรือดูเฉพาะตัวเลขด้วย `/mh-usage compact` ส่วน `/mh-usage agy on` และ `/mh-usage agy off` ใช้ไม่ได้แล้ว เพราะ Mods ไม่ได้เป็น owner ของ Agy quota ค่าที่เลือกจะจำไว้ข้าม session

ตัวเลขคือเปอร์เซ็นต์ที่เหลือในแต่ละช่วง quota ไม่ใช่ context usage และไม่รวมหลายช่วงเข้าด้วยกัน ใช้ `/mh-usage status` ดูสรุป Codex ได้ระหว่างที่ agent ทำงาน ถ้าต้องการดูทุกช่วงพร้อมเวลา reset ให้เปิด `/mh-usage status 1` แล้วใช้คำสั่งหน้าถัดไปที่ท้าย panel ปิดเองได้ด้วย `/mh-usage close` ค่าเก่าจะแสดง `stale` ส่วนข้อมูลที่อ่านไม่ได้จะแสดง `unavailable` ไม่แทนด้วยศูนย์ ตัว mod ใช้ login เดิมของ Codex ใน `~/.codex` และไม่ refresh auth ให้เอง ส่วน Agy quota ต้องมาจาก external หรือ Agy-native producer ที่เขียนข้อมูลตาม public sidebar protocol รายละเอียด cache และข้อจำกัดอยู่ใน [MOD.md](../MOD.md#compact-statusline)

### ต้องรู้

- ข้อมูล Git, memory, reflection และ RTK refresh ทุก 10 วินาที ไม่ใช่ทุก millisecond
- Background subagent ที่ยัง `pending` หรือ `running` จะแสดงเป็น `⏳ bg <type> [+N] <elapsed>` ต่อให้ parent turn จบแล้ว โดยไม่แสดง task description หรือ prompt ถ้า lifecycle context ของ host ไม่ส่ง child ที่ยังรันอยู่ ตัว statusline จะ fallback ไปดูเฉพาะ descendant Letta process และแสดงเป็น `⏳ agent <type> [+N] <elapsed>`; shell/monitor task ยังตรวจด้วย `/bg`
- Activity จาก turn, LLM, tool และ compaction เป็นสถานะชั่วคราว
- แถวสถานะ quota มีไม่เกิน 2 แถว: แถวแรกเป็น statusline ปกติ แถวถัดมาเป็น Codex เมื่อเปิดใช้งาน ปิด Codex ก็เอาแถวนั้นออก ถ้าปิดไว้จะกลับไปใช้แบบเดิมที่มีแถวหลักและแถวล้นได้อีกหนึ่งแถวเมื่อพื้นที่ไม่พอ
- Panel สรุปและหน้ารายละเอียดใช้ไม่เกิน 5 แถว เพื่อเหลือพื้นที่ให้ statusline ทั้ง 2 แถวภายใต้เพดานรวม 8 แถวของ host ถ้ามี panel อื่นอยู่ด้วย อาจต้องปิด panel นั้นก่อน
- ถ้า host ไม่มี `ui.panels` จะไม่มี statusline และ diagnostics อาจมี warning เรื่อง panel capability ซึ่งไม่เท่ากับ mod พัง
- ถ้า statusline หายหลังแก้ source ให้ติดตั้ง package ใหม่แล้ว `/reload` แทนการแก้ installed copy

---

## 10. Lazy MCP Proxy

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

`/mh-run list` ก็แสดงเฉพาะ run ที่ยังไม่ terminal (`handed_off`/`abandoned`) และแสดง Goal refs ที่ประกาศไว้เพื่อให้ตาม mission ได้ง่ายขึ้น; refs เหล่านี้เป็น coordination metadata ไม่ได้ยืนยันว่า mission ยัง revision ล่าสุด

### งาน UX/UI เต็ม flow

```text
Mahiro Goal → UX Workflow → explicit design-owner brief
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
