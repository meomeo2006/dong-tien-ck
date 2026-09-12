# Dòng tiền CK

Dashboard theo dõi dòng tiền vào ngành nghề và cổ phiếu thị trường chứng khoán Việt Nam theo **ngày / tuần / tháng / năm**.

Site: https://meomeo2006.github.io/dong-tien-ck/

## Kỳ lọc

- **Ngày** = 1 phiên gần nhất
- **Tuần** = 5 phiên
- **Tháng** = 20 phiên
- **Năm** = các phiên có trong năm (kéo CafeF khi bấm Làm mới)

## Nguồn dữ liệu

- CafeF PriceHistory (công khai): OHLCV + GTGD từng mã / chỉ số
- Snapshot nhúng **VN100** (100 mã HOSE) + VNINDEX/VN30/HNX/UPCOM, 20 phiên chốt **11/09/2026**
  - `js/data.js` — chỉ số (20 phiên OHLCV)
  - `js/vn100-1.js` … `js/vn100-4.js` — 25 mã/file, compact 20 phiên
- Live cache `localStorage` (`dtck_cache_v6`)
- Bấm **Làm mới CafeF** hoặc mở trang để kéo thêm phiên (kỳ Năm)

## Công thức

- **GTGD** = tổng giá trị khớp lệnh (tỷ đồng) trong kỳ
- **Dòng tiền ròng** ≈ GTGD mã tăng − GTGD mã giảm
