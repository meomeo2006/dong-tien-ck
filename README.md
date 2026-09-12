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
- Snapshot nhúng trong `js/data.js` để hiện số ngay khi mở trang
- Live cache `localStorage` (`dtck_cache_v3`)

## Công thức

- **GTGD** = tổng giá trị khớp lệnh (tỷ đồng) trong kỳ
- **Dòng tiền ròng** ≈ GTGD mã tăng − GTGD mã giảm
