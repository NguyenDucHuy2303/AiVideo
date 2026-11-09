# Thư viện hoạt hình Wata

Mọi thứ đã làm cho một truyện đều nằm ở đây để truyện sau dùng lại. Khi thêm nhân vật, động tác, bối cảnh, hiệu ứng hay thời đại mới, ghi thêm vào file này.

Nguyên tắc nội dung (truyện lịch sử, cổ tích Việt Nam):
- Thuần Việt, đúng thời đại. Mỗi truyện khai báo `era`, và chỉ vẽ những gì thuộc thời đó (`library/eras.json`: `draw`, `avoid`, `customs`, `sources`).
- Giữ thuần phong mỹ tục. Vua Hùng và tổ tiên được vẽ trang nghiêm. Trang phục kín đáo. Cảnh đánh nhau hợp với trẻ em: không máu, không chết chóc chi tiết.
- Phim liền mạch. Không chia chương, trừ khi chạy `--chapters`.

## Thời đại (`library/eras.json`)

| era | Thời kỳ | Truyện |
|---|---|---|
| `van_lang` | Hùng Vương, văn hóa Đông Sơn (khoảng TK VII–III TCN) | Thánh Gióng, Sơn Tinh Thủy Tinh, Bánh chưng bánh giầy, Chử Đồng Tử, Mai An Tiêm |

Mẫu nhân vật (archetypes) thời Văn Lang: `boy` `baby` `mother` `elder` `king` `lord` (Lạc tướng, sứ giả) `soldier` `villager_man` `villager_woman` `hero` (tráng sĩ giáp sắt) `hero_free` `enemy`. Bộ tự động tự chọn mẫu theo tên nhân vật ("vua" → king, "sứ giả" → lord, "bà/mẹ/vợ" → mother…).

Thời đại mới thì thêm một khối vào `eras.json`, gồm mô tả, những thứ cần tránh, nguồn tư liệu và mẫu nhân vật. Trang phục mới (nếu cần) vẽ trong `runtime/human.js`.

## Nhân vật (`runtime/human.js`, `runtime/horse.js`)

- Dáng (`body`): `child` `man` `strong` `woman` `elder`
- Trang phục (`outfit.type`):
  - Thời Văn Lang: `dongson` (áo chui đầu có dải hoa văn trống đồng; nữ mặc váy, nam đóng khố) và `plume` (lễ phục vua Hùng: áo đính đồng, váy viền lông chim).
  - Dùng chung: `armor` (giáp sắt), `enemy`, `loincloth`.
  - Thời muộn hơn: `tunic`, `robe`, `dress`.
- Chi tiết: `bareChest`, `tattoo` (xăm hoa văn), `bracelets`, `earrings` (đồ đồng), `beard`, `cape`, `cheeks`, `eyeScale`
- Tóc: `traidao` `bun` `long` `short` `turban` `bald`
- Mũ: `feather` (mũ lông chim vua Hùng) `feather_band` (dải lông chim Lạc tướng/lính) `helmet` (nón sắt tráng sĩ) `enemy_helmet` `crown` `nonla` (chỉ dùng cho thời có tư liệu)
- Đạo cụ (`prop`, `props` để đổi giữa cảnh bằng `set.prop`): `iron_whip` `broken_whip` `bamboo` `spear` `bronze_axe` `shield` `horn` (tù và) `sword` `stick` `basket` `bowl` `scroll` (không dùng cho thời Văn Lang) `flag`
- Ngựa: `kind: iron` (ngựa sắt bờm lửa) | `plain`
- Dáng người (`build`): `slim` `average` `heavy` (bụng phệ). Trong đám đông, mỗi người tự khác nhau một chút. Tay chân thuôn dần, bàn tay có ngón cái, cổ ngắn chắc, áo và váy có nếp gấp.
- **Khuôn mặt hướng 3/4** (`runtime/face.js`, `look.face`): `shape` round/oval/square/jowl · `eyes` round/almond/narrow/droopy · `nose` button/round/long · `brows` thin/thick/bushy · `wrinkles` · `mustache` thin/thick/droopy · `iris` · `eyeScale`. Mẫu nhân vật thời Văn Lang đã có sẵn gương mặt riêng.
- 15 nét mặt: `neutral happy joy laugh sad worried scared angry determined surprised shout yawn sleepy proud crying`. `happy` cười tươi, má đẩy mi dưới lên thành mắt cười, có nếp cười ở khóe miệng. `joy` là mừng rỡ, mắt nhắm híp cong, miệng cười rộng ("mừng rỡ / hớn hở / sung sướng" trong lời thoại tự ra `joy`). Mí trên, mí dưới, đồng tử co giãn, mắt nhắm cười, miệng có răng và lưỡi, ký hiệu mồ hôi, nước mắt, má đỏ, gân giận. Mắt tự chớp. `talk` để nhép môi, `viseme` (a/o/u/i/e/m) khi có lời thoại. `lookAt: <id>` để ánh mắt nhìn về một nhân vật.
- Tay giơ quá vai tự vẽ phía sau đầu, không che mặt trong cảnh cận.

## Động tác (`runtime/motions.js`)

- Người: `idle still walk run stretch heroic raise point talk wave cheer bow kneel sit crouch leap ride swing ride_swing fall lie sit_up fly eat give worry land call march charge carry undress hold_bowl`
- Ngựa: `stand walk gallop rear fly`
- Các động tác nối mượt vào nhau (0,25 s). `leap` với `onto` thì nhảy lên ngựa rồi tự cưỡi theo nhịp phi của ngựa.

## Bối cảnh (`runtime/scenery.js`, `runtime/stage.js`)

- Bối cảnh: `village` `field` `bamboo` `palace` (nhà sàn lớn mái thuyền) `mountain` (Sóc Sơn) `sky` (cõi tiên, trên mây)
- Giờ: `dawn` `day` `dusk` `night` (bầu trời, nắng/trăng, sương, màu)
- `bamboo` (rừng tre): tre luôn do thư viện vector vẽ, cao vượt đầu người cưỡi ngựa; tranh nền chỉ vẽ đồng và núi phía sau (model vẽ tre thành cây cọ).
- `era: van_lang` thì nhà sàn có mái cong hình thuyền và chim trang trí.
- Vật thể (`set.objects`, có thể kèm `from`/`until` để hiện ra hoặc biến mất): `footprint` `mat` `rice` `nong` (nong tre đựng cơm/cà: `count`, `food: rice | ca`, `empty: true` thì xếp chồng nong đã ăn hết; dùng cho "bảy nong cơm, ba nong cà") `bowls` `armor` `banner` `stumps` `stone` `fire_pit`

### Tranh nền vẽ (`backdrops.ts`)

Khi đã cài model vẽ (SD-Turbo), mỗi cảnh tự nhận một **tranh nền phong cách hoạt hình 2D** gồm trời, núi xa và đồng ruộng. Mỗi tổ hợp `set` × `time` × `era` chỉ vẽ một lần, lưu ở `assets/library/generated/backdrops/` để mọi truyện dùng lại.
- Tranh **chỉ có cảnh quan, không có nhà cửa**. Kiến trúc đúng thời đại (nhà sàn mái thuyền, cung vua Văn Lang) vẫn do thư viện vector vẽ, để không lọt kiến trúc sai thời.
- Khi có tranh nền, các lớp vector xa (đồi, tre, cau, ruộng) tự ẩn, chỉ giữ đường đất, nhà và cỏ tiền cảnh. Tranh trôi chậm theo camera (thị sai), lặp kiểu soi gương khi lia xa, và mờ nhẹ ở cảnh cận.
- Tắt cho một cảnh bằng `"backdrop": false`.
- Lưu ý: SD-Turbo chạy `cfg 1` thì bỏ qua danh sách cấm (negative). Muốn nó tránh hẳn một thứ thì truyền `cfg: 1.5–2` (`GenerateOptions.cfg`), đổi lại tranh kém sắc nét hơn. Cách chắc ăn hơn: không nhắc thứ đó trong prompt, và để thư viện vector vẽ.

## Hiệu ứng (`runtime/fx.js`)

`transform` (biến hình) `fire` (`up`: phun lên trời) `dust` (tự có khi chạy/phi) `impact` `smoke` `embers` `sparkle` `glow` `rays` `pop` `flash` `shake` `speedlines`

## Camera (`runtime/camera.js`)

`wide` `full` `medium` `close` (`part`: head/mouth/seat) `track`. Cảnh cận canh theo cỡ đầu: mặt chiếm khoảng nửa khung, kể cả khi nhân vật đang cúi. Bộ tự động cắt mỗi cảnh có hai người trở lên thành toàn cảnh → cận người hành động → cận người phản ứng, khoảng 2–3 giây một góc. Máy tự canh khung theo hộp bao của mọi nhân vật trong cảnh (kể cả người cưỡi, roi, áo choàng), ở cả 16:9 lẫn 9:16. Máy trễ khi nhân vật đổi kích thước (`sizeLag`), bay lên theo người bay (`followY`). Ngoài ra có `push`, `dx`/`dy`, `ease`.

## Lời thoại nhân vật

Trong kịch bản (mỗi dòng một cảnh), lời kể viết bình thường. Lời nhân vật viết dạng `Tên: "…"`, có thể thêm cách nói `Tên (mừng rỡ): "…"`:

```
Giặc Ân kéo sang xâm lược nước ta. Vua Hùng (lo lắng): "Mau đi khắp nơi tìm người tài cứu nước!"
```

- `project.json` → `"voices"`: giọng của từng nhân vật theo tên, ví dụ `"Mẹ": "Ngọc Huyền"`. Giọng trẻ con dùng giọng nữ nâng cao độ: `"Gióng": { "voice": "Mai Anh", "pitch": 4 }`.
- `project.json` → `"speakers"`: tên trong kịch bản ứng với `id` diễn viên trong các file cảnh, ví dụ `"Gióng": ["boy"]`, `"Giặc": ["e1", "e2"]` (lấy người đầu tiên có mặt trong cảnh).
- Khi nhân vật nói: miệng mở theo âm lượng giọng thật từng khung hình, dáng miệng theo nguyên âm từng tiếng. Camera cắt cận vào người nói, người khác nhìn về phía người nói. Nét mặt theo cách nói. Phụ đề lời thoại màu vàng, có ngoặc kép.
- Cách nói được hiểu: vui/mừng · cười · buồn · lo · sợ · giận/tức · ngạc nhiên/sửng sốt · hét/hô · quyết/dõng dạc · khóc · tự hào.
- Ví dụ đầy đủ: `projects/thanh-giong-thoai/`.

## Thương hiệu kênh (`assets/brand/`, `brand/brand.html`, `brand/brand.ts`)

Kênh **Huy Kể Chuyện** (Nguyễn Đức Huy). Tên, khẩu hiệu và màu nằm trong `assets/brand/brand.json`. Logo là mặt trống đồng Đông Sơn (ngôi sao 14 cánh, vòng hoa văn, 6 chim Lạc bay quanh) với dải đỏ ghi tên kênh.
- `logo.png` (1024², nền trong suốt), `watermark.png` (256², chỉ mặt trống).
- `intro_16x9.mp4` (3 s): trống bay xoay vào, hào quang, tên kênh bật ra, tiếng trống, chuông.
- `outro_16x9.mp4` (5 s): "Cảm ơn các bạn đã xem!", nút ĐĂNG KÝ được bấm thành ĐÃ ĐĂNG KÝ, chuông rung.
- Mỗi khổ hình chỉ vẽ một lần. Sửa `brand.json` hoặc `brand.html` thì xóa các file trong `assets/brand/` (giữ `brand.json`) để vẽ lại.
- `cartoon` tự ghép: intro → phim (logo mờ góc phải trên) → outro, và xuất `out/<tên>_thumbnail.jpg` (1280×720). Thêm `--no-brand` để tắt.
- Thumbnail: tiêu đề vàng viền đỏ, tự xuống tối đa 2 dòng và tự co cho vừa khung, dải khẩu hiệu phía trên, logo góc phải. Khung hình mặc định là cảnh cận câu thoại mạnh nhất. Muốn chọn tay thì ghi trong `project.json`: `"thumbnail": { "at": 36, "title": "Thánh Gióng", "subtitle": "Truyện cổ tích Việt Nam" }` (`at` = giây trong phim, không tính intro).

## Quy trình

```bash
npm run wata -- story <script.txt> --name <tên>                        # kịch bản → storyboard
npm run wata -- build projects/<tên>/storyboard.json                  # giọng đọc
# projects/<tên>/project.json: "era": "van_lang"
npm run wata -- animate projects/<tên>                                 # bản nháp tự động các cảnh
npm run wata -- cartoon projects/<tên> [--vertical] [--after 18:00]    # phim liền mạch
```

Cảnh soạn tay hoặc đã chỉnh: `projects/<tên>/anim/sNN.json`, dùng chung `cast.json` (`"castFile"`). Ví dụ đầy đủ: `projects/thanh-giong/anim/`.
