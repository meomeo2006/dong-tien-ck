# Dòng tiền CK

Dashboard theo dõi dòng tiền vào ngành nghề và cổ phiếu thị trường chứng khoán Việt Nam theo **ngày / tuần / tháng / quý**.

Site: https://meomeo2006.github.io/dong-tien-ck/

## Nguồn dữ liệu

- **CafeF PriceHistory** (công khai, CORS `*`): OHLCV + GTGD từng mã / chỉ số.
- **Snapshot nhúng** trong `js/data.js`:
  - 8 phiên gần nhất (chốt 11/09/2026) cho lọc Ngày / Tuần
  - **Tổng hợp cả tháng** T6 / T7 / T8 năm 2026 (GTGD, ròng, % giá, số phiên) cho 65 mã

Nút **Làm mới CafeF** kéo thêm phiên gần. Khối tháng dương lịch lấy từ snapshot.

## Công thức

- **GTGD** = tổng giá trị khớp lệnh (tỷ đồng) trong kỳ
- **Dòng tiền ròng** ≈ GTGD mã tăng − GTGD mã giảm
