# CLAUDE.md — Wata Video Studio

Phần mềm chạy trên máy, tự làm phim hoạt hình thiếu nhi. Chủ kênh là Nguyễn Đức Huy. Từ 12/11/2026 chỉ còn **hai kênh YouTube**:
- **Huy Kể Chuyện** (kênh kể chuyện): truyện, lịch sử, ngụ ngôn, bản tiếng Anh của truyện (chuyên mục Huy Tells Tales, giờ đăng riêng `english` trong `publish`), chuyên mục Hỏi Huy, Học tiếng Anh, Shorts "Bạn có biết?".
- **Ask Huy** (kênh hỏi–đáp tiếng Anh): hỏi–đáp, Shorts "Did you know?". Không đăng truyện.
- Lời mời đăng ký luôn nêu tên kênh thật, không nêu tên chuyên mục (`home` trong `src/studio/qa.ts`). Đăng video: `src/studio/publish.ts` (Xuất tay: mỗi chủ đề một thư mục `~/youtube/<tên chủ đề>/` gom video dài, Shorts, ảnh bìa, tệp hướng dẫn; Tự đăng khi đã qua audit). **Video đã có link YouTube thì không làm lại** (`onYouTube` trong `jobs.ts`; nút render lại từ chối; luật người dùng 18/11/2026). **Thư mục đăng luôn giữ bản mới nhất**: video render lại được đặt lại ngay sau render, không chờ duyệt lại (`staleExport`); Short của phim cũ bị gỡ, giữ giờ đăng cho bản cắt mới.
- Lịch đăng (`src/studio/calendar.ts`): tab 📅 Lịch đăng trên trang duyệt, tab Lịch trên điện thoại (`/m#lich`). **Lịch chỉ có video trong danh sách Chờ đăng** (job `done`, không `publishHold`; bản tiếng Anh khi `english` là `done`): video đang làm lại hay chờ duyệt không lên lịch dù tệp cũ còn trong thư mục (luật người dùng 18/11/2026); video đã lên YouTube thì luôn ở lại. Người dùng bận cuối tuần (`offDays: [0, 6]` của mỗi kênh trong `publish`): giờ đăng thứ Bảy, Chủ nhật chỉ dành cho video đã vào thư mục đăng trước hết thứ Sáu (tải lên, hẹn giờ trước); thứ Năm 17:00 dòng hằng ngày chọn luôn phần cuối tuần (`needToday`). Google Drive (`src/studio/drive.ts`, rclone ở `vendor/rclone`, cấu hình `studio/secrets/rclone.conf`, remote `wata`): mỗi 5 phút chép thư mục chủ đề lên `Wata/<chủ đề>` kèm `Lich dang.txt`, chạy bên cạnh bộ lập lịch (không chặn render); chủ đề đăng hết thì xóa khỏi Drive sau 7 ngày.
- Lời đăng (tiêu đề, mô tả, thẻ, cài đặt, giờ; TikTok/Facebook) có trong tệp của thư mục đăng và mục "Lời đăng" trên trang duyệt (mỗi bài chờ đăng). Truyện: mô tả cho người xem do `src/studio/copy.ts` viết khi chuẩn bị video (Sonnet, ~7–8k token mỗi truyện, lưu `copy.json`), nguồn tư liệu lọc theo bộ não và tên truyện. Short lấy câu thoại riêng làm tiêu đề.
- TikTok đăng tay: lời đăng ở `src/studio/social.ts` (không tốn token), tệp `dang-tiktok-facebook.txt` trong thư mục chủ đề; TikTok không cho bấm link trong mô tả nên lời đăng ghi link ra chữ kèm "link ở bio".
- **Facebook do studio đăng 100%** (từ 16/11/2026, `src/studio/facebook.ts`): mọi Short lên Trang của kênh (`publish.<kênh>.facebookPage`: Huy Kể Chuyện 1517448471441161, Ask Huy 1454308931101593) dạng Reel đúng giờ Short trên lịch, tự đánh dấu ✔; bài quá giờ cách nhau ≥90 phút mỗi Trang; Reel đã có trên Trang (đăng tay, cùng dòng đầu) chỉ đánh dấu. Video dài và bản tiếng Anh chỉ đăng YouTube. **Mọi bài Facebook và TikTok đều có link YouTube** (`linkOfShort` trong `publish.ts`: Short của phim dẫn tới phim; Short "Bạn có biết?" dẫn tới bản dài nếu đã ra trước giờ Short, không thì dẫn tới chính nó): Reel chỉ đăng khi người dùng đã dán link và video đó đã công khai; chưa có link thì lời đăng để chỗ trống `LINK_WAIT`. Khi mã Trang có quyền `pages_manage_engagement`, link chuyển xuống bình luận đầu tiên của Trang (`src/studio/fbside.ts`, mô tả ghi "👇 link ở bình luận đầu tiên"). Lời đăng viết cho bố mẹ (`parentLine` trong `social.ts`). Mỗi sáng `fbside.ts` ghi số liệu hai Trang vào `studio/fbstats.jsonl` và báo cáo `Bao cao Facebook.txt` (studio/ và Drive); lượt phát cần quyền `read_insights`. Ứng dụng Meta "AskHuy" (chế độ phát triển, không cần xét duyệt), mã Trang không hết hạn trong `studio/secrets/facebook.json`; mất hiệu lực khi người dùng đổi mật khẩu Facebook hoặc gỡ quyền, khi đó tạo lại qua Graph API Explorer.
- Kênh YouTube thật: Ask Huy chưa có kênh riêng, đăng lên kênh cá nhân "Huy Nguyen" (`publish.ask-huy.youtube`).
- Điện thoại: trang `/m` (`src/studio/phone.html`, khóa trong `src/studio/phone.ts`). Studio nghe mọi địa chỉ (0.0.0.0); máy khác phải có khóa (cookie từ mã QR). Cổng 5176 là https với chứng chỉ riêng của studio (`src/studio/tls.ts`, chỉ hợp lệ trong mạng nhà) để iPhone lưu video thẳng vào Ảnh. Người dùng dùng iPhone.

Luồng chính: chủ đề → tư liệu → kịch bản có lời thoại → nhân vật và bảng trang phục → **duyệt kịch bản** → giọng, chỉ đạo cảnh, tranh nền → render → **duyệt video** → bản tiếng Anh và Shorts. Từ 12/11/2026 studio tự duyệt cả hai bước: 17:00 tự chọn kịch bản, video qua kiểm tra máy móc thì tự duyệt sau `review.videoHours` (1 giờ). Người dùng chỉ nhận video cuối trong `~/youtube/` và đăng tay; video không qua kiểm tra thì nằm lại tab Duyệt video và phải báo người dùng.

Kênh thứ hai **Ask Huy** (tiếng Anh, trẻ 6–12, mỗi video trả lời một câu hỏi): job `kind: "qa"`.
- `src/studio/qa.ts`: kịch bản, soát sự thật, đề xuất câu hỏi.
- `qaproduce.ts`: giọng, chỉ đạo cảnh, tranh nền, render.
- `runtime/board.js`: bảng giải thích SVG.
- Người dẫn là Huy (25 tuổi); em trai Hùng (21, phụ tá làm thí nghiệm, áo tím); bé Bối (gái, 8 tuổi) hỏi; em trai Beo (5 tuổi, dáng `body: "small"`) hay đoán ngây ngô. Cả bốn có mặt suốt video ở mọi chương trình hỏi đáp, Shorts và Học tiếng Anh (`helper`, `kid`, `little` trong `QAProfile`). Trước 12/11/2026 Bối tên là Mai (kịch bản cũ ghi "Mai" vẫn đọc được). Kokoro đọc sai tên Việt ("Huy" thành "Hi", "Bối" thành chuỗi vô nghĩa), nên `src/tts/kokoro_worker.py` (`NAMES`) đưa phiên âm tiếng Việt của Huy, Hùng, Bối, Beo, "Kể Chuyện" vào thẳng; thêm tên khác thì thêm vào đó.

**Học tiếng Anh cùng Huy theo hướng mới (từ 16/11/2026, đã gắn vào studio 17/11):** mỗi bài là **một tập phim có cốt truyện riêng**, diễn ở nơi chốn thật (phòng khách, vườn…), không bảng, không khuôn chung. Người dùng đã bỏ cách "dạy trên bảng" vì trẻ chán.
- `src/studio/episode.ts`: bộ não viết tập phim (khoảng 20k token): 12–18 cảnh, 4–6 từ tiếng Anh gắn với đồ vật hoặc con vật trong truyện, hành động ghi bằng bộ từ ngắn (`beats`). Mở bằng tình huống ngay câu đầu; kết bằng đoạn ôn đọc theo nhịp, lời mời đăng ký tại chỗ, hé lộ tập sau. `buildEpisode` dựng dự án: giọng, kiểm tiếng Anh, dàn cảnh, vẽ nền.
- `src/studio/staging.ts`: đổi `beats` thành cảnh cho trình phát, không tốn token. **Luôn thấy đủ 4 nhân vật trong khung hình** (luật của người dùng).
- **Tiếng Anh phải đọc chính xác.** Chữ tiếng Anh trong câu tiếng Việt viết `*Cat!*`: phần đó đọc bằng giọng Kokoro của chính nhân vật (`narrate.ts` `langRuns`). Mọi câu tiếng Anh được Whisper nghe lại (`src/audio/englishcheck.ts`).
- **Giọng tiếng Anh đã chốt (17/11/2026)**, thử bằng Whisper và so theo âm IPA:
  - af_heart đọc đúng nhất (Bối pitch 3, Beo pitch 2). af_nova, af_sky, am_liam, am_eric đọc sai nhiều, đã bỏ khỏi `cast.ts`.
  - Giọng nam yếu hơn: am_michael, bm_lewis.
- **Mọi video có tiếng Anh** (Ask Huy, bản tiếng Anh của truyện, tập phim) làm giọng qua `src/audio/voicefix.ts` `voicesChecked`.
  - Whisper nghe từng câu, so theo âm (`englishcheck.ts`, `src/tts/ipa.py`).
  - Từ đang dạy và câu ngắn (từ 4 chữ trở xuống) phải đúng từng âm.
  - Sai thì đổi sang giọng tốt kế tiếp, 3 lượt; vẫn sai thì dừng, không render.
- Từ 17/11/2026 không còn bài Học tiếng Anh kiểu cũ (dạy trên bảng, `formats.ts`); dòng `hoc-tieng-anh` chỉ làm tập phim.
- Con vật, đồ vật biết nói (tối đa 2 mỗi tập), tự giới thiệu tên tiếng Anh.

**Học tiếng Anh cùng Huy (cách cũ, sẽ thay)** (job `kind: "lesson"`, `src/studio/lesson.ts`) có nhiều khuôn (`src/studio/formats.ts`, `job.format`):
- Đợt 1 (16/11/2026): thẻ từ, truyện có từ mới, đố vui đối kháng (bảng điểm), nhập vai tình huống, đoán bóng, Beo nói sai. Đợt 2: truy tìm, làm theo tôi, một ngày của Bối, hộp quà bí mật, đếm và tìm màu. Đợt 3: A is for Apple, đọc theo nhịp (clip thử trước).
- Bài mới lấy khuôn lâu chưa dùng nhất trong `pick.lines[].formats` của dòng, rồi bộ não tìm chủ đề hợp khuôn. Đổi khuôn trên trang duyệt thì viết lại kịch bản.
- `[3s]` trong kịch bản là khoảng lặng cho trẻ trả lời: màn hình hiện đồng hồ, `class="answer"`/`"shadow"` trên bảng hiện sau khoảng lặng (`runtime/board.js`). Câu nhân vật nói toàn tiếng Anh đọc bằng giọng Kokoro của nhân vật đó (`"Bối@en"` trong `voices`, như trên Ask Huy).

Mỗi **dòng nội dung** khai báo trong `studio/settings.json` → `pick.lines`, gồm `kinds`, `perWeek` (số video mỗi tuần, sửa trên tab Đăng YouTube), `ahead`, `propose`.
- Dịp lễ (`src/studio/occasions.ts`): bài hợp dịp sắp tới được làm trước, và được tự chọn từ 14 đến 2 ngày trước dịp.
- Studio tự tìm chủ đề khi sắp hết kịch bản.
- 17:00 tự chọn kịch bản điểm cao nhất nếu người dùng chưa chọn đủ (`src/studio/pick.ts`). Từ 17/11/2026 mỗi dòng **giữ sẵn video cho `pick.leadDays` (3) ngày tới** (`needAhead`): thiếu thì duyệt bù, tối đa 3 bài mỗi dòng mỗi ngày. Người dùng không muốn "ngày nào chuẩn bị ngày đó".
- **Mọi Short "Did you know?"/"Bạn có biết?" đều có bản dài** (`src/studio/longs.ts`, không tốn token): Short vừa được duyệt là studio tạo bài hỏi–đáp `qa`/`qa-vi` cùng chủ đề ("Bạn có biết X?" → "Vì sao X?"), `job.wanted` nên 17:00 chọn trước trong phần của dòng. Video dài là chính, mỗi video dài tự cắt 3 Short; Short riêng: Ask Huy 3, Hỏi Huy 2 bài/tuần (kênh Huy Kể Chuyện đã đủ 7 video dài/tuần).
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
- Trần token nằm trong `studio/settings.json` (ngày / kịch bản / lần làm video), sửa được trên tab Token. Trần mỗi bài tính theo **từng lượt** (`roundStart`: lượt viết bắt đầu khi vào writing/rewrite, lượt làm video khi vào approved/producing/fix), không cộng dồn. Có nút tạm dừng Claude.
- Claude lỗi hai lần thì chỉ chuyển sang Ollama khi đã có `gemma3:12b`. Không có thì job chờ 30 phút (`retryAt`), không dùng mô hình yếu.
- Người dùng để ý số token bị đốt: thêm bước gọi bộ não mới thì **báo số token đo được**.

## Hình ảnh

- **Hoạt hình vector:** SVG vẽ bằng code (`src/animation/runtime/*.js`), Chrome không giao diện chụp từng khung (`capture.ts`).
  - Cảnh là JSON (`anim/sNN.json`). `player.js` phát cảnh, `motions.js` chứa động tác, `human.js`/`garments.js`/`animals.js` là bộ khớp nhân vật.
  - Chuyển động mượt (18/11/2026): bước đi, chạy tính theo quãng đường nên chân không trượt; quay người có nhịp bóp ngang thay vì lật gương; thân nghiêng theo quán tính khi đi, dừng; nét mặt đổi trong 0,18 giây; `blend` trượt cả thông số một tư thế không có (không nhảy cóc giữa chừng). Động tác `jump` (nhún, bật, chạm đất), `fall` (ngã có trọng lực, nảy), `get_up` (nằm → ngồi → đứng). `staging.ts` nhớ ai đang nằm sang cảnh sau, chờ nhân vật đi tới nơi hoặc làm xong động tác rồi mới làm tiếp, mỗi người đi theo chiều dài chân. Đồ cầm tay nằm dưới cằm, không cao quá 1/3 người cầm.
  - Phim hài (18/11/2026): `soundtrack.ts` tự tổng hợp tiếng boing, thud, slide_up/down, zip, rattle, sting, knock, clap (có `gain`, `dur`), nhạc `comic` (bùm-chát) và `hush` (nhạc tắt phụt cho miếng hài, cảnh dùng `moods`). `staging.ts` gắn tiếng theo động tác (`audio.sfx`), câu hét (`hết hồn`, `hoảng hốt` → nét mặt `shock` mắt lồi; `hét`) làm người khác `startle`; beat mới `startle`, `run_off` (nhún rồi phóng đi, kéo dãn người, bụi, tiếng vèo).
  - Số khung/giây: 30 mặc định; `project.json` `"fps": 60` hoặc `story.ts --fps 60` (render lâu gấp đôi).
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
- **Render dài chỉ sau 18:00 và cuối tuần**, hoặc ban ngày khi người dùng không đụng bàn phím, chuột quá 15 phút (người dùng cho phép ngày 17/11/2026; `idleRenderMinutes`, `userAway` trong `schedule.ts` đọc GNOME IdleMonitor). Giờ hành chính (T2–T6, 8–18h) mà người dùng đang dùng máy thì chỉ làm việc nhẹ; vẽ ảnh thì được. Clip thử ngắn thì được.
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
