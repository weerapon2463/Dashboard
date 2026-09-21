# Production Dashboard — Y2J Machinery

Dashboard สนับสนุนการตัดสินใจด้านการผลิต จัดทำสำหรับการส่งผลงานประกวด **PS Innovation Award 2026**

## เกี่ยวกับโปรเจกต์

Dashboard นี้ให้ผู้บริหารเห็นข้อมูลจากหน้างานจริงประกอบการตัดสินใจ แทนการตัดสินใจโดยไม่มีข้อมูลรองรับ ประกอบด้วย 4 โมดูลหลัก:

1. **Priority Matrix** — จัดลำดับความสำคัญงานผลิตด้วยแกนความเร่งด่วน (Urgency) และผลกระทบ (Impact) แบ่งเป็น 4 กลุ่ม: ทำก่อน / วางแผน / มอบหมาย / ทบทวน-ตัดออก
2. **Capacity Planning** — เปรียบเทียบกำลังการผลิตที่มีกับแผนผลิตจริงในแต่ละไลน์ ล่วงหน้า 8 สัปดาห์ พร้อมสถานะ (ปกติ / เกือบเต็ม / เกินกำลัง)
3. **Master Schedule** — ตารางแผนการผลิตรวมทุกรุ่นเครื่องจักร (YT3000, YT6500, YT7500, W250, W350, AX5000) แสดงขั้นตอน ออกแบบ → จัดซื้อ → ประกอบ → ทดสอบ → ส่งมอบ
4. **Make-or-Buy Decision Support** — เครื่องคำนวณเปรียบเทียบต้นทุนผลิตเองกับซื้อจากซัพพลายเออร์ พร้อมจุดคุ้มทุน (Break-even)

> **หมายเหตุ:** เวอร์ชันนี้ใช้ข้อมูลตัวอย่าง (mock data) ทั้งหมด เพื่อสาธิตแนวคิดและ UX ก่อนเชื่อมข้อมูลจริงในเฟสถัดไป

## เทคโนโลยีที่ใช้

- HTML / CSS / JavaScript (vanilla, ไม่มี build step)
- [Chart.js](https://www.chartjs.org/) โหลดผ่าน CDN (cdnjs)
- ไม่มี backend / server — เป็น static site ล้วน ๆ

## วิธีเปิดใช้งาน

**ออนไลน์:** เปิดผ่าน GitHub Pages (ถ้าตั้งค่าไว้) ที่ `https://<username>.github.io/Dashboard/`

**เครื่องตัวเอง:** เปิดไฟล์ `index.html` ในเบราว์เซอร์ได้โดยตรง หรือรันเซิร์ฟเวอร์เล็ก ๆ:

```bash
python3 -m http.server 8080
# แล้วเปิด http://localhost:8080
```

## โครงสร้างโปรเจกต์

```
Dashboard/
├── index.html              หน้าหลัก (nav + 4 โมดูล)
├── style.css                สไตล์ทั้งหมด รองรับ light/dark mode
├── data.js                  ข้อมูลตัวอย่าง (mock data) + ฟังก์ชันคำนวณ
├── priority-matrix.js       โมดูล Priority Matrix
├── capacity-planning.js     โมดูล Capacity Planning
├── master-schedule.js       โมดูล Master Schedule (Gantt)
├── make-or-buy.js           โมดูล Make-or-Buy
├── app.js                   Navigation + theme toggle + init
└── README.md
```

## แผนขั้นต่อไป (Phase 2)

- เชื่อมข้อมูลจริงจากหน้างานและระบบ Stock/BOM แทน mock data
- นำร่องทดสอบกับโครงการจริง 1 โครงการ (YT6500 หรือ YT3000) ก่อนขยายผล
- เพิ่มข้อมูลซัพพลายเออร์และราคาสำหรับโมดูล Make-or-Buy ให้อัตโนมัติมากขึ้น
