# Wata Video Studio

Kịch bản AI → giọng đọc → MP4 9:16 + 16:9, chạy hoàn toàn local.

```
chủ đề  →  script: LLM local (Ollama) viết  →  storyboard.json  →  build: TTS từng câu, chọn ảnh, dựng timeline  →  timeline.json  →  render (FFmpeg)  →  MP4
```

## Studio tự động

Bạn chỉ cần duyệt. Phần mềm tự đề xuất chủ đề, tìm tư liệu (Wikipedia tiếng Việt), viết kịch bản 5–8 phút có lời thoại, thiết kế nhân vật và vẽ **bảng trang phục**, dựng thời đại còn thiếu trong thư viện, rồi làm video.

```bash
npm run wata -- studio                     # trang web http://127.0.0.1:5175 + bộ lập lịch
bash scripts/install-studio-service.sh     # chạy nền thường trực (tự bật cùng máy)
```

- **Trang web**: Chờ bạn duyệt (kịch bản + bảng trang phục + giọng nghe thử, rồi video) với nút Duyệt / Yêu cầu sửa / Bỏ; Đang làm; Xong; Token (sổ token, trần ngày / kịch bản / video, nút **Tạm dừng Claude** khi bạn cần token cho việc khác và **Tiếp tục tự động**).
- **Lịch**: giờ hành chính (T2–T6, 8:00–18:00) chỉ làm việc nhẹ, ưu tiên thấp; ngoài giờ và cuối tuần render. Luôn giữ sẵn 6 kịch bản chờ duyệt. Sửa trong `studio/settings.json`.
- **Bộ não**: Claude (qua Claude Code, gói của bạn) cho việc cần suy nghĩ; mỗi lần gọi ghi vào `studio/ledger.jsonl`; quá trần thì chuyển sang Ollama (`gemma3:12b` nếu đã tải); tạm dừng thì việc cần Claude đứng chờ.
- **Phong cách, intro, outro**: khi thiết kế nhân vật, bộ não gợi ý phong cách vẽ (7 kiểu: hiện đại, Đông Hồ, sơn mài, lụa, màu nước, sáp màu, cắt giấy) và bộ intro/outro (6 kiểu), kèm lý do. Trên trang duyệt, mỗi phong cách có ảnh mẫu, mỗi intro/outro có video xem trước; ★ là gợi ý, bấm để đổi. Đổi phong cách thì bảng trang phục tự vẽ lại; video đã xong thì có nút **Render lại** (chạy buổi tối, không tốn token).
- **Quy trình một video**: viết → (thời đại mới nếu cần) → nhân vật, bảng trang phục → **bạn duyệt** → giọng, chỉ đạo cảnh, tranh nền (ban ngày) → render (ban đêm) → **bạn duyệt video** (ghi chú sửa thì làm lại cảnh đó) → xong.

Lệnh lẻ (thử từng bước):

```bash
npm run wata -- topics --count 5                     # đề xuất chủ đề
npm run wata -- write son-tinh-thuy-tinh             # tìm tư liệu, viết kịch bản, nhân vật, bảng trang phục
npm run wata -- era ly_tran --title "Nhà Trần"       # dựng một thời đại vào thư viện
npm run wata -- produce son-tinh-thuy-tinh --test 6  # chạy thử sản xuất trên 6 cảnh đầu
npm run wata -- brand                                # vẽ sẵn mọi bộ intro/outro (xem trước trên trang duyệt)
npm run wata -- tokens                               # token đã dùng
```

AI chỉ viết lời và gợi ý. Thời lượng cảnh lấy từ độ dài giọng đọc thật, phụ đề theo thời điểm của từng câu, mọi thứ renderer cần đều do code quyết định.

## Quy trình làm một video

```bash
cd ~/WataCreateVideo                                   # mọi lệnh chạy trong thư mục này
npm run wata -- script "chủ đề" --duration 45          # AI viết nháp
# đọc và sửa projects/<tên>/storyboard.json
npm run wata -- build projects/<tên>/storyboard.json --render
```

Video nằm ở `projects/<tên>/out/<tiêu-đề>_9x16_<mã>.mp4` và `…_16x9_<mã>.mp4`. Mã là hash nội dung: sửa storyboard rồi build lại sẽ ra file mới, file cũ không bị ghi đè. Bản nháp model viết cần người đọc lại vì model nhỏ hay sai logic hoặc sự thật.

## Video kể chuyện (kịch bản của bạn)

```bash
npm run wata -- story projects/thanh-giong/script.txt --name thanh-giong --title "Thánh Gióng"
npm run wata -- build projects/thanh-giong/storyboard.json --render
```

- `script.txt`: dòng ngắn không có dấu chấm là **tên chương**, còn lại là đoạn văn. Lời đọc là **đúng từng chữ** của bạn; dòng lặp lại hoặc dạng chú thích ảnh ("… 1") bị bỏ và báo ⚠.
- Mỗi cảnh 1–2 câu (5–12 giây). AI local chỉ thiết kế hình: danh sách nhân vật (một lần, để mỗi nhân vật giống nhau ở mọi cảnh), hình dạng mới ở cảnh biến hình ("trở thành…": hỏi riêng từng cảnh), rồi mỗi cảnh: nền, giờ trong ngày, nhân vật, hành động, hiệu ứng.
- Luật cố định sửa lỗi hay gặp của model nhỏ (đối chiếu với lời kể): bỏ nhân vật truyện không nhắc tới; bỏ câu tả người khỏi mô tả nền (người là bóng, không vẽ vào nền); `fly_up` chỉ khi lời kể có "bay", `grow` chỉ khi có "lớn / vươn vai / trở thành…"; cảnh "bay lên trời" luôn có nhân vật được nhắc tên; sau cảnh biến hình nhân vật giữ hình dạng mới.
- Bóng nhân vật: ảnh vẽ phải có nền trắng (mép tối = ảnh chụp/hỏng → vẽ lại với cách diễn đạt khác, tối đa 3 lần); mặt/tay sáng màu được lấp kín.
- Hình: nền **tranh vẽ AI** riêng cho 16:9 và 9:16 + **bóng nhân vật** (tối, viền sáng vàng) có chuyển động: `appear`, `enter_left/right`, `grow` (vươn vai thành khổng lồ), `charge` (phi qua khung), `rise`, `fly_up` (bay về trời).
- Hiệu ứng: `embers` (lửa), `dust`, `stars`, `mist`, `light_rays`, `leaves`, `rain`, `flash`, `shake` (rung khung). Chớp/rung rơi đúng lúc cao trào (khi Gióng lớn xong…).
- Âm thanh: nhạc ngũ cung (gảy kiểu đàn tranh + nền trầm, trống khi đánh trận) do ffmpeg tổng hợp — không bản quyền — tự nhỏ xuống khi có lời đọc; tiếng nổ, trống trận, gió, ngân… theo hành động; tiếng chuông mỗi chương. Thẻ tên chương hiện 4 giây đầu chương.
- Cần trình tạo ảnh (`bash scripts/setup-imagegen.sh`). Chưa cài thì vẫn ra video nhưng nền là màu và không có nhân vật.
- Sửa `storyboard.json` (mô tả nền, hành động, hiệu ứng) rồi `build` lại: chỉ cảnh thay đổi được vẽ/render lại.

## Hoạt hình vector (đang dùng)

Nhân vật có khớp, cử động thật, vẽ bằng SVG trong Chrome headless, quay từng khung bằng FFmpeg. Miễn phí, chạy local.

Một cảnh là một file JSON, không cần viết code. Ví dụ đầy đủ: `projects/thanh-giong/anim/` (phim liền mạch) và `projects/thanh-giong-thoai/anim/` (có lời thoại). Thử riêng một cảnh:

```bash
node src/animation/render.ts projects/thanh-giong/anim/s11-12.json            # 16:9, kèm ….preview.html để xem chạy lặp
```

Danh mục thư viện (thời đại, nhân vật, khuôn mặt, động tác, bối cảnh, hiệu ứng, camera, lời thoại, thương hiệu kênh): **`src/animation/LIBRARY.md`**. Mã nguồn: `src/animation/runtime/`, `capture.ts`, `render.ts`, `story.ts`.

### Cả truyện thành phim hoạt hình

```bash
npm run wata -- story projects/thanh-giong/script.txt --name thanh-giong   # kịch bản → storyboard (nếu chưa có)
npm run wata -- build projects/thanh-giong/storyboard.json                 # giọng đọc + timeline.json
npm run wata -- animate projects/thanh-giong                               # AI local thiết kế các cảnh → anim/sNN.json
npm run wata -- cartoon projects/thanh-giong                               # → out/<tên>-hoat-hinh_16x9.mp4
npm run wata -- cartoon projects/thanh-giong --vertical --after 18:00      # bản 9:16, đợi tới 18h mới chạy
```

- `animate`: AI chỉ chọn trong menu của thư viện (bối cảnh, giờ, nhạc, ai đứng đâu, làm gì, nét mặt, hiệu ứng, góc máy); luật cố định đối chiếu với lời kể tiếng Việt ("bay … trời" → bay lên, "nằm ngửa" → nằm, "cất tiếng" → ngồi dậy nói, "tan tác" → giặc ngã, "phun lửa", "nhảy lên ngựa"…); cảnh biến hình ("trở thành…") tự có vươn vai → lớn lên → hình dạng mới, và từ đó nhân vật giữ hình dạng mới. File `anim/sNN.json` đã có (có thể bạn đã sửa) được giữ nguyên trừ khi `--force`.
- Tên file cảnh cho biết nó thuộc câu kể nào: `s05` = cảnh 5, `s04a` + `s04b` = hai shot của cảnh 4, `s11-12` = một shot cho cảnh 11 và 12. Tổng thời lượng phải bằng lời đọc (có cảnh báo nếu lệch).
- `cartoon`: render từng cảnh (có cache: sửa cảnh nào chỉ render lại cảnh đó), nối thành **một phim liền mạch** (chỉ mờ vào đầu phim, mờ ra cuối phim), giọng đọc đúng chỗ, nhạc theo `mood`, tiếng động tự lấy từ hành động/hiệu ứng, phụ đề. `--chapters` để chia chương (thẻ tên chương, mờ qua màn đen, tiếng chuông). Khoảng 1 phút máy cho mỗi 8 giây phim.

## Cài đặt

```bash
sudo apt install ffmpeg
npm install
npm run wata -- doctor
```

## AI viết kịch bản (Ollama, local)

```bash
curl -fsSL https://ollama.com/install.sh | sh     # cài Ollama (cần sudo)
ollama pull gemma3:4b                            # ~3.3 GB; cần ~4 GB RAM trống khi chạy
npm run wata -- script "Tại sao con người cần ngủ đủ giấc" --duration 45
npm run wata -- build projects/tai-sao-con-nguoi-can-ngu-du-giac/storyboard.json --render
```

- JSON schema gửi cho model được sinh từ schema Zod (`src/script/prompt.ts`), Ollama dùng nó để ràng buộc đầu ra.
- Đầu ra được kiểm tra (schema + tiếng Việt có dấu + số cảnh). Sai thì gửi lại đúng lỗi cho model sửa, tối đa 3 lần, rồi mới báo lỗi.
- Độ dài: lời đọc lệch quá ±20% so với `--duration` thì model được yêu cầu viết lại theo số chữ từng cảnh; sau 3 lần vẫn lệch thì giữ bản gần nhất và cảnh báo (model nhỏ đếm chữ kém).
- Code tự dọn đầu ra: viết hoa kicker, đổi Title Case kiểu tiếng Anh thành viết hoa đầu câu (giữ tên riêng), bỏ `body` chỉ lặp lại lời đọc. Mỗi thay đổi đều in ra ⚠.
- Viết xong, model được giải phóng khỏi RAM ngay (nếu không Ollama giữ ~3 GB thêm 5 phút, làm TTS/render bị swap).
- Toàn bộ hội thoại với model được lưu ở `projects/<tên>/build/logs/script-*.json`.
- `storyboard.json` đã có sẽ không bị ghi đè (có thể bạn đã sửa tay) — dùng `--force` hoặc `--name`.
- Nên đọc lại storyboard trước khi build: model nhỏ có thể viết sai sự thật.
- Đổi model: `--model qwen2.5:7b` (cần nhiều RAM hơn). Đổi máy chủ: biến môi trường `OLLAMA_HOST`.

## Giọng đọc truyền cảm (VieNeu-TTS, offline) — khuyên dùng cho video kể chuyện

```bash
bash scripts/setup-vieneu.sh        # cài vào vendor/vieneu, tải model, đọc thử 10 giọng vào vendor/vieneu/samples/
```

- VieNeu-TTS v3 Turbo: giọng tiếng Việt tự nhiên, có ngữ điệu, chạy CPU. Model Apache-2.0; **các giọng có sẵn được phép dùng cho nội dung thương mại/kiếm tiền** (theo model card).
- Dùng: trong `project.json` đặt `"engine": "vieneu", "voice": "<tên giọng>"` (ví dụ `"Ngọc Huyền"`, `"Minh Đức"`), rồi `npm run wata -- build projects/<tên>/storyboard.json --voice-only` (chỉ làm giọng + timeline, không vẽ ảnh) và `npm run wata -- cartoon projects/<tên>`. Các cảnh hoạt hình tự co giãn theo độ dài giọng mới.
- Thử một câu: `npm run wata -- say "Ngày xửa ngày xưa…" --engine vieneu --voice "Ngọc Huyền"`.
- Không dùng tính năng nhân bản giọng của người khác khi chưa được phép.

## Giọng đọc (Piper, offline)

```bash
bash scripts/setup-tts.sh            # tải Piper + 3 giọng tiếng Việt vào vendor/, kiểm tra SHA-256
npm run wata -- voices               # danh sách giọng + license
npm run wata -- say "Xin chào, đây là giọng đọc thử." --voice vi_VN-vais1000-medium
```

| Giọng | Chất lượng | License dữ liệu huấn luyện |
|---|---|---|
| `vi_VN-vais1000-medium` (mặc định) | medium | CC BY 4.0 — dùng thương mại được, cần ghi nguồn VAIS-1000 |
| `vi_VN-25hours_single-low` | low | không rõ — kiểm tra trước khi đăng |
| `vi_VN-vivos-x_low` | x_low | CC BY-NC-SA 4.0 — **không** dùng thương mại |

Văn bản được chuẩn hóa trước khi đọc: `7-9 tiếng` → "bảy đến chín tiếng", `30%` → "ba mươi phần trăm", `2024` → "hai nghìn không trăm hai mươi tư". Phụ đề vẫn giữ chữ số.

`--engine dummy` thay giọng đọc bằng tiếng "ù" dài tương ứng câu — dùng để thử quy trình khi chưa có TTS.

## Từ storyboard tới video

```bash
npm run wata -- fixtures                                                    # ảnh mẫu + thư viện ảnh mẫu
npm run wata -- build projects/example-sleep/storyboard.json --render       # hoặc thêm --engine dummy
```

Một project là một thư mục:

```
projects/<tên>/
├── storyboard.json   # AI viết
├── project.json      # người chọn: engine, voice, speed, fps, profiles (tùy chọn)
├── timeline.json     # sinh ra — đừng sửa tay, build sẽ ghi lại
├── gen/              # tts/ (cache từng câu), audio/ (audio từng cảnh), assets/ (ảnh đã chép vào)
├── build/            # cache render + logs
└── out/              # MP4
```

### storyboard.json

```jsonc
{
  "title": "…",
  "scenes": [{
    "narration": "Lời đọc. Mỗi câu thành một phụ đề.",        // bắt buộc, ≤ 600 ký tự
    "onScreen": { "kicker": "≤30", "title": "≤90", "body": "≤180" },
    "visual": { "query": "english keywords", "description": "…", "mood": "calm|dark|warm|energetic|nature|serious" },
    "camera": "slow zoom in",        // gợi ý tự do → ken_burns, zoom_in, pan_right, …
    "transition": "fade",            // gợi ý tự do → fade, slide_left, …
    "graphic": { "type": "big_number", "value": "7–9", "unit": "tiếng", "label": "mỗi đêm" }   // tùy chọn, xem dưới
  }]
}
```

### Đồ họa (code tự vẽ)

`graphic` biến một cảnh thành infographic động thay cho ảnh. Renderer vẽ bằng hình vector của libass trong cùng lượt với chữ: sắc nét ở mọi độ phân giải, không cần file ảnh, mỗi cảnh vài giây.

| `type` | Nội dung | Chuyển động |
|---|---|---|
| `big_number` | `value` ("7–9", "30%", "1.500"), `unit`, `label` | số đếm dần lên (số đơn) hoặc bật ra (khoảng), gạch chân chạy ra |
| `list` | `items`: 2–4 × `{ icon, text }` | từng dòng trượt vào **đúng lúc câu tương ứng được đọc** |
| `compare` | `left`/`right`: `{ title, icon, points[≤3] }`, `tone`: `neutral` \| `bad_good` (đỏ/xanh) | thẻ trái hiện trước, thẻ phải hiện ở câu thứ hai; 16:9 cạnh nhau, 9:16 xếp chồng |
| `icon` | `icon`, `label` | vòng tròn và icon bật ra |
| `none` | — | cảnh ảnh bình thường |

- Icon: 122 icon Lucide (license ISC) chọn sẵn ở `assets/icons/lucide.json`, tên như `brain`, `moon`, `heart-pulse`, `battery-low`… Tên lạ → `sparkles` và cảnh báo. Thêm icon: sửa danh sách trong `scripts/vendor-icons.ts` rồi chạy `node scripts/vendor-icons.ts`.
- AI được dặn dùng đồ họa cho khoảng một nửa số cảnh. Số trong `big_number` **phải có trong lời đọc**, nếu không model bị yêu cầu viết lại (chống bịa số liệu).
- Cảnh có đồ họa: tiêu đề lên đầu khung, `body` bị bỏ, nền gradient theo `mood` (không tìm ảnh).

Trường lạ bị bỏ qua, `duration` bị bỏ qua, gợi ý không hiểu được thì cảnh báo và dùng mặc định — dữ liệu AI không bao giờ làm dừng quy trình vì lý do nhỏ.

### Ảnh tự động

`build` tự chọn ảnh cho từng cảnh theo thứ tự:
1. Ảnh trong thư viện local khớp ít nhất 2 từ của `visual.query` và chưa dùng trong video.
2. Tìm trên mạng theo `visual.query` (tiếng Anh): **Pexels** nếu có key, rồi **Openverse**. Chỉ lấy license cho phép dùng thương mại và chỉnh sửa, ảnh cạnh ngắn ≥ 600px.
   - Ảnh Openverse được model nhìn ảnh local chấm điểm trước khi dùng (≥ 6/10, là ảnh chụp hoặc minh họa, không có chữ lớn). Mỗi cảnh thử tối đa 4 ảnh, khoảng 30–60 giây mỗi ảnh; ảnh bị loại được nhớ ở `verdicts.json` để không tải lại.
   - Ảnh dùng được lưu vào `assets/library/<pexels|openverse>/` kèm tác giả và license, video sau tìm thấy ngay ở bước 1.
3. **Ảnh AI tạo trên máy** (nếu đã cài, xem dưới) từ `visual.description`.
4. Không có gì phù hợp → nền gradient theo `mood`. Mạng lỗi không bao giờ làm dừng build.

Nguồn ảnh của mỗi video ghi ở `projects/<tên>/credits.txt`: dán vào mô tả video. Ảnh CC BY/BY-SA **bắt buộc** ghi tác giả.

Ảnh nhỏ hoặc sai tỷ lệ (phóng to > 1.5 lần mới lấp kín khung) được đặt nguyên ảnh lên nền là chính nó làm mờ, thay vì cắt và phóng to bị vỡ. Renderer quyết định riêng cho 9:16 và 16:9 (`fit: "auto"`; có thể đặt `"cover"` hoặc `"contain"` trong timeline).

**Key ảnh (khuyên dùng, miễn phí):** ảnh Pixabay/Pexels đúng chủ đề hơn Openverse nhiều và không cần chờ model kiểm tra. Ghi key vào file `.env` ở thư mục dự án:

```
PIXABAY_API_KEY=key-của-bạn     # đăng nhập pixabay.com, key nằm ở https://pixabay.com/api/docs/ mục "Parameters"
PEXELS_API_KEY=key-của-bạn      # https://www.pexels.com/api/ (11/2026: Pexels tạm ngừng cấp key mới)
```

Thứ tự dùng: Pexels → Pixabay → Openverse. Kiểm tra key bằng `npm run wata -- doctor`. Ảnh Pixabay qua API rộng tối đa 1280px; khổ 16:9 vẫn lấp kín khung, khổ 9:16 hiện nguyên ảnh trên nền mờ. Kết quả tìm kiếm được lưu 24 giờ ở `assets/library/<nguồn>/searches.json` (Pixabay yêu cầu), build lại không tìm lại.

`.env` không được đưa vào git. Muốn tắt tìm ảnh trên mạng: `build --offline` hoặc `"onlineImages": false` trong `project.json`.

### Ảnh AI tạo trên máy (SD-Turbo)

```bash
bash scripts/setup-imagegen.sh        # ~2 GB: stable-diffusion.cpp (CPU) + SD-Turbo, kiểm tra SHA-256
npm run wata -- imagine "a cozy bedroom at night, soft warm lamp light" -o thu-anh.png
```

- Ảnh 512×512, 4 bước, mỗi ảnh khoảng 15–40 giây trên CPU 6 nhân (chưa đo trên máy này). Hiện nguyên ảnh trên nền mờ ở cả hai khổ.
- Cùng mô tả → cùng ảnh (seed lấy từ hash), ảnh được lưu ở `assets/library/generated/` và dùng lại.
- `project.json`: `"imageGen": "fallback"` (mặc định: chỉ khi không tìm được ảnh), `"prefer"` (tạo trước, rồi mới tìm ảnh trên mạng), `"off"`.
- License SD-Turbo (Stability AI Community License): miễn phí cho cá nhân; **dùng thương mại** (kiếm tiền từ video) cần doanh thu < 1 triệu USD/năm và **đăng ký miễn phí** ở https://stability.ai/community-license. `credits.txt` tự thêm dòng "Powered by Stability AI" khi video có ảnh AI.
- Model nhỏ hay vẽ sai tay, mặt, chữ: hợp với cảnh không khí (phòng ngủ, bầu trời, ánh đèn) hơn ảnh cần chân thực.

### Thư viện ảnh

```bash
npm run wata -- library add ~/Pictures/ngu --to sleep --license "ảnh tự chụp"
npm run wata -- library add bed.jpg --to sleep --tags "bed,bedroom,night,sleep" --license "Pexels"
npm run wata -- library list
```

- Ảnh được chép vào `assets/library/<tên>/` với tên là hash nội dung, nên thêm lại cùng ảnh sẽ được bỏ qua.
- Không có `--tags` thì model nhìn ảnh local (gemma3:4b) viết mô tả, tag tiếng Anh và vị trí chủ thể (để cắt khung 9:16 không mất chủ thể). Mỗi ảnh mất khoảng nửa phút đến một phút trên CPU, chỉ làm một lần.
- `library.json` được lưu sau mỗi ảnh: dừng giữa chừng rồi chạy lại sẽ làm tiếp. Muốn tag lại thì thêm `--retag`. Tag sai thì sửa thẳng trong `library.json`.
- Ghi `--license` cho mỗi đợt ảnh; `library list` báo ảnh chưa có license hoặc độ phân giải dưới 1080px.

Mọi file `library.json` dưới `assets/library/` được đọc:

```json
{ "images": [{ "file": "bed.jpg", "tags": ["night", "bedroom", "sleep"], "description": "…", "source": "…", "license": "…", "focus": { "x": 0.5, "y": 0.4 } }] }
```

Ảnh được chọn theo từ trùng giữa `visual.query` + `description` của cảnh và ảnh: trùng tag được 2 điểm, chỉ trùng mô tả ảnh được 1 điểm, ảnh chưa dùng trong video được thêm nửa điểm. Không có ảnh khớp → nền gradient theo `mood`. Ảnh được chép vào `gen/assets/` để project tự chứa đủ.

## Chạy demo renderer

```bash
npm run wata -- fixtures                                # tạo ảnh + âm thanh mẫu bằng ffmpeg
npm run wata -- render fixtures/demo/timeline.json      # → fixtures/demo/out/*.mp4
```

Âm thanh demo là tiếng "bíp" ở đầu mỗi cảnh, dùng để kiểm tra đồng bộ cho tới khi có TTS.

## Lệnh

| Lệnh | Tác dụng |
|---|---|
| `doctor` | kiểm tra ffmpeg, filter, encoder, font, TTS, ổ đĩa, RAM, Quick Sync |
| `script "<chủ đề>" [--name] [--duration 60] [--scenes N] [--notes] [--model] [--force] [--build] [--render]` | LLM viết storyboard |
| `build <storyboard> [--voice] [--speed] [--engine piper\|dummy] [--render]` | storyboard → TTS → timeline (→ MP4) |
| `library add <ảnh\|thư mục…> --to <tên> [--license] [--source] [--tags] [--retag]` / `library list` | thêm ảnh vào thư viện (tự tag bằng model nhìn ảnh) / xem thư viện |
| `story <script.txt> [--name] [--title] [--force] [--render]` | kịch bản của bạn → storyboard video kể chuyện |
| `imagine "<prompt>" [-o file]` | thử tạo ảnh AI trên máy |
| `voices` / `say "<text>"` | liệt kê giọng / nghe thử |
| `validate <file>` | kiểm tra timeline, không render |
| `render <file> [--profile 9x16] [--encoder qsv] [--force]` | render; mặc định cả hai tỷ lệ |
| `fixtures [--force]` | tạo asset cho `fixtures/demo` |
| `npm test` / `npm run typecheck` | unit test / kiểm tra kiểu |

## Cách đảm bảo ổn định

- **Kiểm tra trước khi render:** schema Zod, đường dẫn không được ra ngoài thư mục project, mọi ảnh/audio được ffprobe trước. Lỗi được báo cùng lúc.
- **Chuẩn hóa chữ:** Unicode NFC (tránh vỡ dấu tiếng Việt), bỏ emoji, bỏ ký tự điều khiển ASS. Font Noto Sans đi kèm project.
- **Đo chữ bằng font thật:** độ rộng từng ký tự đọc từ file TTF (`src/renderer/fontMetrics.ts`), ngắt dòng cân đối, tự thu nhỏ chữ khi dài — chữ không bao giờ tràn khỏi vùng an toàn.
- **Cache theo hash:** mỗi clip cảnh có tên chứa hash của nội dung + asset. Sửa một cảnh thì chỉ cảnh đó render lại.
- **Không ghi dở, không ghi đè:** ghi ra file `.tmp-*`, kiểm tra bằng ffprobe (kích thước, số frame, độ dài audio) rồi mới đổi tên. Video cuối có hash trong tên, bản cũ không bị ghi đè.
- **Đồng bộ chính xác tới từng sample:** thời gian tính bằng frame; audio mỗi cảnh được pad/cắt đúng `frames × 48000 / fps` sample.
- **Âm lượng chuẩn:** track audio dựng một lần cho mọi tỷ lệ, chuẩn hóa loudness 2 lượt (đo → áp gain tuyến tính) về `loudnessLufs`.
- **Tiến trình an toàn:** ffmpeg chạy bằng mảng tham số (không qua shell), có timeout, log đầy đủ ở `build/logs/`.
- **Khóa project:** hai lần render cùng project không chạy chồng lên nhau.
- **Ngắt an toàn:** Ctrl+C dừng luôn ffmpeg con, nhả lock, xóa file tạm. Chạy lại cùng lệnh để tiếp tục — cảnh đã xong được giữ trong cache.
- **Dự phòng encoder:** `--encoder qsv` lỗi thì tự chuyển về libx264.

## timeline.json

```jsonc
{
  "schemaVersion": 1,
  "title": "…",
  "fps": 30,                         // 24 | 25 | 30 | 60
  "profiles": ["9x16", "16x9"],
  "loudnessLufs": -14,
  "scenes": [{
    "id": "hook",                    // a-z 0-9 _ -
    "durationFrames": 150,           // sau này lấy từ độ dài TTS
    "audio": { "src": "audio/01.wav", "offsetFrames": 0, "volume": 1 },
    "background":                    // một trong ba loại:
      { "type": "image", "src": "assets/a.jpg", "motion": "ken_burns", "focus": { "x": 0.5, "y": 0.5 }, "dim": 0.35 },
      // { "type": "color", "color": "#0F172A" }
      // { "type": "gradient", "from": "#1E3A8A", "to": "#0F172A", "direction": "diagonal" }
    "texts": [{ "role": "title", "text": "…", "animation": "slide_up", "startFrame": 0 }],
    "caption": "Lời thoại, tự chia thành phụ đề 2 dòng.",
    "transitionOut": { "type": "fade", "frames": 12 }
  }]
}
```

- `motion`: none, ken_burns, zoom_in, zoom_out, pan_left, pan_right, pan_up, pan_down
- `texts[].role`: kicker, title, body (xếp chồng theo thứ tự này, tự thu nhỏ chữ khi dài)
- `texts[].animation`: none, fade, slide_up, typewriter
- `transitionOut.type`: cut, fade, fadeblack, dissolve, slide_left, slide_up, wipe_left, circle_open

Layout của từng tỷ lệ (vùng an toàn, cỡ chữ, vị trí) nằm ở `src/layouts/index.ts`.

## Đăng YouTube

Studio đăng lên **hai kênh** (gộp từ bốn kênh ngày 12/11/2026):

| Kênh | Nội dung | Danh sách phát |
|---|---|---|
| **Huy Kể Chuyện** (tiếng Việt) | truyện cổ tích, truyền thuyết, lịch sử, ngụ ngôn; hỏi–đáp tiếng Việt; học tiếng Anh; Shorts "Bạn có biết?" | Truyện cổ tích Việt Nam · Truyền thuyết Việt Nam · Lịch sử Việt Nam cho bé · Truyện ngụ ngôn · Hỏi Huy · Học tiếng Anh cùng Huy · Bạn có biết? (Shorts) |
| **Ask Huy** (tiếng Anh) | hỏi–đáp tiếng Anh; Shorts "Did you know?"; bản tiếng Anh của truyện (loạt Huy Tells Tales) | Ask Huy: Big Questions · Did You Know? (Shorts) · Huy Tells Tales: Vietnamese Folk Tales |

"Hỏi Huy" và "Huy Tells Tales" giờ là chuyên mục, không phải kênh riêng: video vẫn chào bằng tên chuyên mục và giữ intro riêng, nhưng lời mời đăng ký và outro nêu tên kênh thật. Danh mục YouTube chọn theo từng video: truyện là Phim và hoạt hình, hỏi–đáp và học tiếng Anh là Giáo dục.

Mỗi kênh có một chế độ, chọn ở tab **Đăng YouTube** của trang duyệt:

- **Xuất tay** (mặc định): mỗi video bạn đã duyệt xong được studio xếp vào một thư mục trong `~/Videos/Wata/<tên kênh>/`, tên thư mục bắt đầu bằng giờ công khai. Trong đó có:
  - `video.mp4` (liên kết cứng tới file của studio, không tốn thêm dung lượng);
  - `anh-bia.jpg`;
  - `dang-len-youtube.txt`: kênh, giờ công khai, tiêu đề, mô tả, thẻ, danh mục, ngôn ngữ, "dành cho trẻ em".

  Bạn tải lên bằng YouTube Studio và chọn **Lên lịch** đúng giờ ghi trong tệp. Sau đó dán link vào bài trên trang duyệt (mục YouTube, ô **Đã đăng**). Studio ghi nhận, rồi xuất Shorts của bài đó (mô tả có link tới video chính, giờ công khai sau video chính). Nút **📦 Xuất để đăng tay** trên mỗi bài và nút **Xuất tất cả bài chờ đăng** xuất ngay, không chờ studio.
- **Tự đăng**: studio tự tải lên ở chế độ riêng tư kèm giờ công khai; đến giờ YouTube tự công khai. **Chỉ bật khi dự án Google đã qua audit** (xem dưới). Nửa giờ sau giờ công khai, studio kiểm tra video. Nếu video vẫn riêng tư (bị khóa), studio chuyển kênh về Xuất tay, xuất lại các video bị khóa để bạn đăng tay, và báo trên trang duyệt những video cần xóa trong YouTube Studio.
- **Tắt**: không làm gì.

Hai kênh tạo chung một tài khoản Google, không cần hai email. Một số điện thoại xác minh được hai kênh mỗi năm, vừa đủ. Vào YouTube, chọn ảnh đại diện → **Cài đặt** → **Thêm hoặc quản lý kênh** → **Tạo kênh**. Mỗi kênh là một tài khoản thương hiệu (Brand Account), có tên và logo riêng.

### Kết nối để tự đăng

Xuất tay không cần bước nào dưới đây. Tự đăng cần làm các bước sau **một lần**.

1. Vào <https://console.cloud.google.com/> và tạo một dự án mới, ví dụ "Wata Studio".
2. Vào **APIs & Services → Library**, tìm **YouTube Data API v3**, bấm **Enable**.
3. Vào **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - Chọn **External**.
   - Điền tên ứng dụng và email của bạn.
   - Ở mục Audience, bấm **Publish app** để chuyển sang **In production**. Nếu để ở "Testing", quyền đăng hết hạn sau 7 ngày.
   - Ứng dụng chỉ mình bạn dùng, nên không cần gửi Google xét duyệt. Khi đăng nhập sẽ có cảnh báo "Google chưa xác minh ứng dụng này": bấm **Advanced → Go to …** để tiếp tục.
4. Vào **APIs & Services → Credentials**:
   - Chọn **Create credentials → OAuth client ID**, loại **Desktop app**.
   - Tải file JSON về, đổi tên thành `client_secret.json`.
   - Đặt vào `studio/secrets/client_secret.json`. Thư mục này không đưa lên git.
5. Mở trang duyệt ở tab **Đăng YouTube** (<http://127.0.0.1:5175/#youtube>):
   - Bấm **Kết nối kênh** cho từng kênh: Huy Kể Chuyện, Ask Huy. (Kết nối trước ngày 12/11/2026 thì kết nối lại: studio cần thêm quyền quản lý danh sách phát.)
   - Đăng nhập Google và chọn đúng kênh. Nếu kênh là tài khoản thương hiệu (Brand Account), Google sẽ hỏi bạn chọn kênh nào.
6. Bật **Tự động đăng lên kênh này** và chỉnh giờ công khai nếu muốn.
7. Tạo API key để studio xem xu hướng (không bắt buộc):
   - Vào **Credentials → Create credentials → API key**.
   - Bấm **Restrict key** và chỉ chọn **YouTube Data API v3**.
   - Lưu chuỗi key vào `studio/secrets/youtube_api_key.txt`.

   Mỗi ngày một lần, studio xem các video thiếu nhi đang được xem nhiều nhất theo từng dòng nội dung, và lượt xem của các video mình đã đăng. Bộ đề xuất chủ đề dùng những thông tin này làm gợi ý. Lịch mùa lễ (Tết, Trung Thu, 1/6, khai giảng, 20/11, Halloween, Giáng sinh…) chạy sẵn, không cần key.

Muốn đặt ảnh bìa riêng, kênh phải được xác minh số điện thoại tại <https://www.youtube.com/verify>. Nếu chưa xác minh, video vẫn được đăng, chỉ thiếu ảnh bìa.

Mọi video đều được khai **dành cho trẻ em** (Made for Kids). YouTube bắt buộc khai như vậy với nội dung thiếu nhi (luật COPPA).

Hạn mức của Google: mỗi ngày tối đa 100 lần tải lên. Mỗi lần đặt ảnh bìa tốn 50 trong 10.000 điểm/ngày, nên dư sức cho studio.

### Audit của YouTube (bắt buộc trước khi bật Tự đăng)

Video tải lên qua API từ một dự án Google Cloud **chưa qua audit** bị YouTube khóa ở chế độ riêng tư. Video bị khóa không công khai được, cũng không kháng nghị được, phải xóa đi và đăng lại. Audit khác với bước "xác minh ứng dụng" của màn hình đồng ý OAuth: không xác minh ứng dụng thì vẫn dùng được, nhưng không qua audit thì video bị khóa.

Nộp đơn tại **YouTube API Services – Audit and Quota Extension Form** (tìm đúng tên này trong trang trợ giúp của YouTube API Services; đăng nhập bằng tài khoản Google sở hữu dự án). Thời gian chờ có thể vài tuần. Trong lúc chờ, để các kênh ở Xuất tay.

Gợi ý nội dung trả lời (sửa cho đúng thông tin của bạn):

- **Tên và mục đích ứng dụng:** "Wata Studio" là công cụ nội bộ chạy trên máy cá nhân của chủ kênh, chỉ để đăng video hoạt hình thiếu nhi do chính chủ kênh sản xuất lên các kênh của mình. Không có người dùng nào khác, không cung cấp cho bên thứ ba.
- **Kênh sử dụng:** Huy Kể Chuyện và Ask Huy, cùng thuộc một tài khoản Google của chủ kênh (điền link các kênh).
- **API dùng:** `videos.insert` (tải video lên ở chế độ riêng tư với `publishAt`, `selfDeclaredMadeForKids: true`), `thumbnails.set`, `playlists.list` / `playlists.insert` / `playlistItems.insert` (xếp video vào danh sách phát theo loạt), `videos.list` (kiểm tra trạng thái video của chính mình), `channels.list` (`mine=true`, lấy tên kênh khi kết nối), `search.list` / `videos.list` bằng API key (xem xu hướng video thiếu nhi để gợi ý chủ đề).
- **Dữ liệu người dùng:** chỉ lưu refresh token của các kênh của chủ kênh trên máy cá nhân (`studio/secrets/`, không đưa lên mạng). Không thu thập, không chia sẻ dữ liệu của người dùng YouTube khác.
- **Tần suất:** khoảng 1 video dài và 1–3 Shorts mỗi ngày cho mỗi kênh. Hạn mức mặc định là đủ.
- **Tuân thủ:** mọi video được khai "dành cho trẻ em" (COPPA), có tiêu đề, mô tả và nguồn tư liệu do chủ kênh duyệt trước khi đăng; người xem không đăng nhập hay cấp quyền gì cho ứng dụng.

Google có thể yêu cầu thêm chính sách quyền riêng tư (một trang web ngắn nói rõ các điểm trên) hoặc video quay màn hình quy trình kết nối và đăng. Khi có kết quả audit, bật **Tự đăng** cho từng kênh trên trang duyệt.
