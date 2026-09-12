# Dòng tiền CK

Dashboard theo dõi dòng tiền vào ngành nghề và cổ phiếu thị trường chứng khoán Việt Nam theo **ngày / tuần / tháng / quý**.

Mở trang: mở `index.html` trên trình duyệt, hoặc bật GitHub Pages (Settings → Pages → Deploy from branch `main` / root).

## Tính năng

- Chỉ số VN-Index, VN30, HNX, UPCOM
- Phân bổ dòng tiền (GTGD mã tăng / giảm / đứng)
- Bảng ngành + heatmap cổ phiếu
- Lọc kỳ Ngày (1 phiên), Tuần (5), Tháng (20), Quý
- Làm mới dữ liệu từ API lịch sử công khai CafeF

## Công thức

- **GTGD** = tổng giá trị khớp lệnh (tỷ đồng) trong kỳ
- **Dòng tiền ròng** ≈ GTGD mã tăng − GTGD mã giảm

Nguồn dữ liệu: CafeF. Không phải feed realtime của FireAnt.

## Cấu trúc

```
index.html
css/style.css
js/app.js
js/data.js   # snapshot nhúng
```
