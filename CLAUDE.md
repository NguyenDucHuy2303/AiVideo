# CLAUDE.md — Wata Video Studio

Phần mềm chạy trên máy, tự làm phim hoạt hình thiếu nhi. Chủ kênh là Nguyễn Đức Huy. Từ 12/11/2026 chỉ còn **hai kênh YouTube**:
- **Huy Kể Chuyện** (tiếng Việt): truyện, lịch sử, ngụ ngôn, chuyên mục Hỏi Huy, Học tiếng Anh, Shorts "Bạn có biết?".
- **Ask Huy** (tiếng Anh): hỏi–đáp, Shorts "Did you know?", bản tiếng Anh của truyện (chuyên mục Huy Tells Tales).
- Lời mời đăng ký luôn nêu tên kênh thật, không nêu tên chuyên mục (`home` trong `src/studio/qa.ts`). Đăng video: `src/studio/publish.ts` (Xuất tay: mỗi chủ đề một thư mục `~/youtube/<tên chủ đề>/` gom video dài, Shorts, ảnh bìa, tệp hướng dẫn; Tự đăng khi đã qua audit).
- TikTok và Facebook đăng tay: lời đăng ở `src/studio/social.ts` (không tốn token), tệp `dang-tiktok-facebook.txt` trong thư mục chủ đề.
- Điện thoại: trang `/m` (`src/studio/phone.html`, khóa trong `src/studio/phone.ts`). Studio nghe mọi địa chỉ (0.0.0.0); máy khác phải có khóa (cookie từ mã QR). Cổng 5176 là https với chứng chỉ riêng của studio (`src/studio/tls.ts`, chỉ hợp lệ trong mạng nhà) để iPhone lưu video thẳng vào Ảnh. Người dùng dùng iPhone.

Luồng chính: chủ đề → tư liệu → kịch bản có lời thoại → nhân vật và bảng trang phục → **duyệt kịch bản** → giọng, chỉ đạo cảnh, tranh nền → render → **duyệt video** → bản tiếng Anh và Shorts. Từ 12/11/2026 studio tự duyệt cả hai bước: 17:00 tự chọn kịch bản, video qua kiểm tra máy móc thì tự duyệt sau `review.videoHours` (1 giờ). Người dùng chỉ nhận video cuối trong `~/youtube/` và đăng tay; video không qua kiểm tra thì nằm lại tab Duyệt video và phải báo người dùng.

Kênh thứ hai **Ask Huy** (tiếng Anh, trẻ 6–12, mỗi video trả lời một câu hỏi): job `kind: "qa"`.
- `src/studio/qa.ts`: kịch bản, soát sự thật, đề xuất câu hỏi.
- `qaproduce.ts`: giọng, chỉ đạo cảnh, tranh nền, render.
- `runtime/board.js`: bảng giải thích SVG.
- Người dẫn là Huy (25 tuổi); em trai Hùng (21, phụ tá làm thí nghiệm, áo tím); bé Bối (gái, 8 tuổi) hỏi; em trai Beo (5 tuổi, dáng `body: "small"`) hay đoán ngây ngô. Cả bốn có mặt suốt video ở mọi chương trình hỏi đáp, Shorts và Học tiếng Anh (`helper`, `kid`, `little` trong `QAProfile`). Trước 12/11/2026 Bối tên là Mai (kịch bản cũ ghi "Mai" vẫn đọc được). Kokoro đọc sai tên Việt ("Huy" thành "Hi", "Bối" thành chuỗi vô nghĩa), nên `src/tts/kokoro_worker.py` (`NAMES`) đưa phiên âm tiếng Việt của Huy, Hùng, Bối, Beo vào thẳng; thêm tên khác thì thêm vào đó.

Mỗi **dòng nội dung** khai báo trong `studio/settings.json` → `pick.lines`, gồm `kinds`, `perWeek` (số video mỗi tuần, sửa trên tab Đăng YouTube), `ahead`, `propose`.
- Dịp lễ (`src/studio/occasions.ts`): bài hợp dịp sắp tới được làm trước, và được tự chọn từ 14 đến 2 ngày trước dịp.
- Studio tự tìm chủ đề khi sắp hết kịch bản.
- 17:00 tự chọn kịch bản điểm cao nhất nếu người dùng chưa chọn đủ (`src/studio/pick.ts`).
- Video chờ duyệt quá `review.videoHours` (12) giờ: kiểm tra máy móc rồi tự duyệt (`src/studio/autoreview.ts`, không tốn token).

Tài liệu chi tiết:
- `README.md`: lệnh và cách dùng.
- `src/animation/LIBRARY.md`: thư viện hình (thời đại, trang phục, nhà, thú vật, phong cách, brand).

## Lệnh

```bash
npm run typecheck                 # tsc, phải sạch
npm test                          # node --test test/*.test.ts
npm run wata                      # in danh sách mọi lệnh CLI (src/cli.ts)
npm run wata -- studio            # trang duyệt http://127.0.0.1:5175 + bộ lập lịch
node src/animation/render.ts <scene.json> [--style dong_ho] [--no-audio] --out x.mp4   # một cảnh
node src/animation/story.ts projects/<tên>                                             # cả phim
npm run wata -- brand             # vẽ sẵn mọi bộ intro/outro
```

Node ≥ 22.18 chạy TypeScript trực tiếp, không có bước build. Import luôn ghi đuôi `.ts`.

## Studio là dịch vụ systemd

- Chạy thường trực dưới tên `wata-studio` (systemd --user, đã bật linger).
  - Xem trạng thái: `systemctl --user status wata-studio`.
  - Nhật ký: `studio/scheduler.log`.
  - **Sửa code studio xong phải `systemctl --user restart wata-studio`.** Việc đang dở không bị đánh dấu lỗi; studio làm tiếp khi chạy lại.
- Việc dài làm tay (benchmark, render thử, vẽ ảnh) phải chạy bằng `systemd-run --user --collect --unit <tên> --setenv=PATH="$PATH" …`. Đừng chạy như tiến trình con của phiên Claude, vì nó chết theo khi phiên đóng.
- Trạng thái từng video nằm ở `studio/jobs/<slug>/job.json`:
  - Luồng chính: writing → review → approved → producing (stage "ready") → video → done.
  - Nhánh phụ: rewrite, fix, rejected, failed.

## Bộ não (Claude) và token

- `src/brain/claude.ts` gọi Claude Code CLI ở chế độ không giao diện. Mỗi lần gọi được ghi vào `studio/ledger.jsonl`.
- Trần token nằm trong `studio/settings.json` (ngày / kịch bản / lần làm video), sửa được trên tab Token. Có nút tạm dừng Claude.
- Claude lỗi hai lần thì chỉ chuyển sang Ollama khi đã có `gemma3:12b`. Không có thì job chờ 30 phút (`retryAt`), không dùng mô hình yếu.
- Người dùng để ý số token bị đốt: thêm bước gọi bộ não mới thì **báo số token đo được**.

## Hình ảnh

- **Hoạt hình vector:** SVG vẽ bằng code (`src/animation/runtime/*.js`), Chrome không giao diện chụp từng khung (`capture.ts`).
  - Cảnh là JSON (`anim/sNN.json`). `player.js` phát cảnh, `motions.js` chứa động tác, `human.js`/`garments.js`/`animals.js` là bộ khớp nhân vật.
- **Phong cách vẽ:** 7 kiểu trong `library/styles.json`, gồm `backdrop` (lời tả cho máy vẽ nền) và `look` (cách `runtime/style.js` khoác lên phần vector).
  - Phim lấy phong cách từ `project.json` `"style"`, do `loadScene` gắn vào từng cảnh.
- **Tranh nền:** FLUX.2 klein 4B Q4 (Apache-2.0) qua stable-diffusion.cpp, khoảng 3–4 phút mỗi ảnh. Mỗi tổ hợp set × giờ × thời đại × phong cách chỉ vẽ một lần, cache ở `assets/library/generated/backdrops/`.
  - SD-Turbo chỉ còn làm dự phòng (giấy phép Stability phải đăng ký nếu kiếm tiền).
- **Thương hiệu theo kênh:** Huy Kể Chuyện ở `assets/brand/`; Ask Huy ở `assets/brand/ask-huy/` (kiểu `ask_huy`, vẽ trong `brand/askhuy.js`). Phim chọn theo `project.json` `"brandId"`.
- **Intro/outro:** 6 bộ (`brand/brand.html` cho trống đồng, `brand/themes.js` cho các bộ khác), chọn theo `project.json` `"brand": {intro, outro}`. Clip cache ở `assets/brand/clips/`; sửa thiết kế thì xóa file trong đó.
- **Lựa chọn của từng video** (`job.art`, `src/studio/art.ts`): bộ não gợi ý, người dùng đổi trên trang duyệt, render thì đồng bộ vào `project.json`.
- **Hình trên bảng giải thích:** bộ não ghi `<icon name="cat" …>`. Hình được tra từ Microsoft Fluent Emoji (MIT, khoảng 3.100 hình) bằng `src/animation/icons.ts`, rồi nhúng vào cảnh.
  - Có 4 kiểu bảng: card, grid, chalk, sketch (Rough.js). Mỗi video một kiểu, chọn theo tên job.
  - Cài thư viện bằng `bash scripts/setup-icons.sh` (vào `vendor/js`).
- **Nhân vật** luôn là vector. Hướng rối vẽ tay (cắt tranh AI thành rối) đã thử ngày 10/11/2026 và bỏ: khớp vai không liền mạch được, đừng làm lại theo cách đó.

## Giọng

- Tiếng Việt: VieNeu-TTS (`vendor/vieneu`), dàn giọng theo nhân vật trong `src/studio/cast.ts`.
- Tiếng Anh: Kokoro-82M (`vendor/kokoro`, Python 3.12 do uv cài riêng).

## Máy

- CPU 6 nhân (Coffee Lake), RAM 14 GB, **không có card đồ họa rời**. Mọi thứ phải chạy được bằng CPU.
- AI làm video hay AI tô lại từng khung hình là không khả thi.
- FLUX dùng khoảng 4,8 GB RAM. Không chạy hai việc FLUX cùng lúc.

## Quy tắc của người dùng (bắt buộc)

- **Trả lời bằng tiếng Việt.** Hỏi ý trước khi bắt đầu việc lớn; người dùng duyệt kế hoạch rồi mới làm.
- **Render dài chỉ sau 18:00 và cuối tuần.** Giờ hành chính (T2–T6, 8–18h) chỉ làm việc nhẹ; vẽ ảnh thì được. Clip thử ngắn thì được.
- **Thuần Việt, đúng thời đại:** trang phục, nhà cửa, phong tục phải đúng thời kỳ. Ví dụ thời Văn Lang không có nón lá, áo tứ thân, mái ngói. Quy định từng thời đại nằm ở `library/eras.json` (`draw`, `avoid`, `customs`). Nâng cấp nào cũng lưu vào thư viện để dùng lại.
- **Phim liền một mạch:** không thẻ chương, không tối màn giữa các chương.
- Thử nghiệm ở khổ 16:9; Shorts 9:16 do studio tự cắt.
- Ưu tiên miễn phí, chạy trên máy, giấy phép rõ ràng (Apache, MIT, CC0). Ghi nguồn khi cần.
- Được tự tải và cài công cụ hay mô hình vào `vendor/` rồi tự chạy thử, đánh giá. **`sudo` và cài đặt toàn hệ thống thì để người dùng làm.**
- Xem kỹ trước khi xóa. Hỏi trước khi xóa dữ liệu lớn hoặc thứ người dùng tạo.
- Không làm video về giấc ngủ (đã gác lại).

## Git

- Làm trên nhánh `studio-tu-dong`, gộp vào `main` bằng fast-forward: `git fetch . studio-tu-dong:main`.
  - Đừng `git checkout`, vì studio đang chạy liên tục ghi `studio/scheduler.json`.
- **Chỉ commit hoặc push khi người dùng bảo.** Commit message viết tiếng Việt.
- Tài khoản GitHub đang bật trên máy thường là `watasoftware` (đẩy lên bị 403). Kho thuộc `NguyenDucHuy2303`:
  1. `gh auth switch --hostname github.com --user NguyenDucHuy2303`
  2. `git push origin main studio-tu-dong`
  3. Chuyển ngay lại: `gh auth switch --hostname github.com --user watasoftware`
- `vendor/`, `projects/*/out/`, `projects/*/build/` không đưa lên git.

## Cách làm việc hiệu quả

- Kiểm tra hình bằng ảnh tĩnh trước, video sau. Dùng `still()` trong `capture.ts`; nó nhận cả URL `http://`, nên chụp được cả trang duyệt.
- Tệp tạm để ở thư mục scratchpad của phiên, không để trong repo.
- Sau khi sửa: chạy `npm run typecheck` và `npm test`; sửa studio thì khởi động lại dịch vụ.
