/**
 * 전적몬 홍보 영상 인코딩 (ffmpeg 필요)
 *
 * make-promo-video.js 가 만든 promo/전적몬-홍보.webm(540x960 VP8)을 받아
 * 플랫폼별 배포본으로 변환한다.
 *
 * 실행:
 *   node tools/encode-promo-video.js
 *   node tools/encode-promo-video.js --bgm="C:/path/music.mp3"   (배경음 삽입)
 *   node tools/encode-promo-video.js --bgm="..." --bgm-volume=0.5
 *   node tools/encode-promo-video.js --gif=28,7                  (GIF 구간: 시작초,길이)
 *   node tools/encode-promo-video.js --only=mp4                  (mp4 만)
 *
 * 결과물(promo/):
 *   전적몬-홍보.mp4        1080x1920 H.264 — X · 인스타 · 쇼츠
 *   전적몬-홍보-16x9.mp4   1920x1080 H.264 — 유튜브 · 랜딩 임베드
 *   전적몬-홍보.gif        480px 무한반복  — 커뮤니티 게시글
 *   전적몬-홍보-썸네일.png 1080x1920      — 업로드 썸네일
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const OUT_DIR = path.join(process.cwd(), "promo");
const SRC = path.join(OUT_DIR, "전적몬-홍보.webm");

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BGM = arg("bgm", "");
const BGM_VOLUME = arg("bgm-volume", "0.4"); // UI 영상은 나레이션이 없어 0.35~0.5 가 무난
const ONLY = arg("only", "");
const [GIF_START, GIF_DUR] = arg("gif", "28,7").split(",").map(Number);
const want = (kind) => !ONLY || ONLY.split(",").includes(kind);

/** PATH 에 없을 수 있으므로(winget 설치 직후) 알려진 위치까지 뒤진다. */
function findFfmpeg(exe) {
  const local = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const candidates = [exe];
  const pkgRoot = path.join(local, "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(pkgRoot)) {
    for (const dir of fs.readdirSync(pkgRoot).filter((d) => /ffmpeg/i.test(d))) {
      for (const build of fs.readdirSync(path.join(pkgRoot, dir))) {
        candidates.push(path.join(pkgRoot, dir, build, "bin", `${exe}.exe`));
      }
    }
  }
  candidates.push(path.join(local, "Microsoft", "WindowsApps", `${exe}.exe`));
  for (const c of candidates) {
    try {
      execFileSync(c, ["-version"], { stdio: "ignore" });
      return c;
    } catch {
      /* 다음 후보 */
    }
  }
  throw new Error(`${exe} 를 찾지 못했습니다. winget install Gyan.FFmpeg 후 다시 실행하세요.`);
}

const FFMPEG = findFfmpeg("ffmpeg");
const FFPROBE = findFfmpeg("ffprobe");

const run = (args) => execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });

function probe(file) {
  const out = execFileSync(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:format=duration,size",
    "-of", "json",
    file,
  ]).toString();
  const j = JSON.parse(out);
  return {
    width: j.streams[0].width,
    height: j.streams[0].height,
    duration: Number(j.format.duration),
    mb: Number(j.format.size) / 1024 / 1024,
  };
}

/* ------------------------------------------------------------------- 인코딩 */

if (!fs.existsSync(SRC)) {
  console.error(`원본이 없습니다: ${SRC}\n먼저 node tools/make-promo-video.js 를 실행하세요.`);
  process.exit(1);
}

const src = probe(SRC);
const DUR = src.duration;
const FADE_OUT = Math.max(0, DUR - 0.7);
console.log(`원본: ${src.width}x${src.height} · ${DUR.toFixed(1)}초 · ${src.mb.toFixed(2)}MB`);

// 배경음: 지정하면 그 파일을, 아니면 무음 트랙을 붙인다.
// (X·인스타는 오디오 트랙이 없는 파일을 간헐적으로 거부한다)
const audioInput = BGM
  ? ["-i", BGM]
  : ["-f", "lavfi", "-t", String(DUR), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];
const audioFilter = BGM
  ? ["-af", `afade=t=in:st=0:d=1,afade=t=out:st=${FADE_OUT.toFixed(2)}:d=0.7,volume=${BGM_VOLUME}`]
  : [];

const results = [];

/* 세로 1080x1920 — X · 인스타 · 쇼츠 */
if (want("mp4")) {
  const out = path.join(OUT_DIR, "전적몬-홍보.mp4");
  run([
    "-i", SRC,
    ...audioInput,
    "-vf", `scale=1080:1920:flags=lanczos,fade=t=in:st=0:d=0.4,fade=t=out:st=${FADE_OUT.toFixed(2)}:d=0.6,format=yuv420p`,
    ...audioFilter,
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-profile:v", "high", "-level", "4.0",
    "-c:a", "aac", "-b:a", "128k", "-shortest",
    "-movflags", "+faststart",
    out,
  ]);
  results.push(["세로 1080x1920 (X·인스타·쇼츠)", out]);
}

/* 가로 1920x1080 — 세로 영상을 블러 배경 위에 얹는다 */
if (want("16x9")) {
  const out = path.join(OUT_DIR, "전적몬-홍보-16x9.mp4");
  run([
    "-i", SRC,
    ...audioInput,
    "-filter_complex",
    "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=24:2,eq=brightness=-0.18[bg];" +
      "[0:v]scale=-2:1080:flags=lanczos[fg];" +
      `[bg][fg]overlay=(W-w)/2:0,fade=t=in:st=0:d=0.4,fade=t=out:st=${FADE_OUT.toFixed(2)}:d=0.6,format=yuv420p[v]`,
    "-map", "[v]", "-map", "1:a",
    ...audioFilter,
    "-c:v", "libx264", "-preset", "slow", "-crf", "21",
    "-c:a", "aac", "-b:a", "128k", "-shortest",
    "-movflags", "+faststart",
    out,
  ]);
  results.push(["가로 1920x1080 (유튜브·랜딩)", out]);
}

/* GIF — 커뮤니티 게시글용 하이라이트 */
if (want("gif")) {
  const out = path.join(OUT_DIR, "전적몬-홍보.gif");
  const palette = path.join(OUT_DIR, ".palette.png");
  const filter = "fps=12,scale=480:-1:flags=lanczos";
  run(["-ss", String(GIF_START), "-t", String(GIF_DUR), "-i", SRC, "-vf", `${filter},palettegen=stats_mode=diff`, palette]);
  run([
    "-ss", String(GIF_START), "-t", String(GIF_DUR), "-i", SRC, "-i", palette,
    "-lavfi", `${filter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    "-loop", "0",
    out,
  ]);
  fs.rmSync(palette, { force: true });
  results.push([`GIF ${GIF_START}~${GIF_START + GIF_DUR}초`, out]);
}

/* 썸네일 — 업로드 커스텀 썸네일 */
if (want("thumb")) {
  const out = path.join(OUT_DIR, "전적몬-홍보-썸네일.png");
  run(["-ss", "1.2", "-i", SRC, "-vframes", "1", "-vf", "scale=1080:1920:flags=lanczos", out]);
  results.push(["썸네일 1080x1920", out]);
}

/* ---------------------------------------------------------------------- 보고 */

console.log("");
for (const [label, file] of results) {
  if (file.endsWith(".png") || file.endsWith(".gif")) {
    const mb = fs.statSync(file).size / 1024 / 1024;
    console.log(`${label}\n  ${file}  (${mb.toFixed(2)}MB)`);
  } else {
    const m = probe(file);
    console.log(`${label}\n  ${file}  (${m.width}x${m.height} · ${m.duration.toFixed(1)}초 · ${m.mb.toFixed(2)}MB)`);
  }
}
if (!BGM) console.log("\n배경음 없이 무음 트랙으로 인코딩했습니다. --bgm=\"경로/음원.mp3\" 로 넣을 수 있습니다.");
