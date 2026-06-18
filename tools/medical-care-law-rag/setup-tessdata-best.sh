#!/usr/bin/env bash
# tools/medical-care-law-rag/setup-tessdata-best.sh [target_dir]
#
# 日本語 OCR を高精度化するため tessdata_best の jpn / eng / jpn_vert を取得し、tesseract が
# txt/tsv 出力に使う configs を system tessdata からコピーして、--tessdata-dir で使える独立した
# tessdata ディレクトリを作る。生成先は既定で gitignore 済みの tmp/ 配下（モデルは大きいので
# Git 管理しない）。
#
# 前提: tesseract（system tessdata に configs を持つもの）と curl が PATH にあること。
# 既定の system tessdata は `tesseract --print-parameters` ではなく `--list-langs` のヘッダから推定する。
set -euo pipefail

TARGET_DIR="${1:-tmp/tessdata-best}"
BEST_BASE="https://github.com/tesseract-ocr/tessdata_best/raw/main"
LANGS=(jpn eng jpn_vert)

command -v tesseract >/dev/null 2>&1 || { echo "[NG] tesseract が見つかりません"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "[NG] curl が見つかりません"; exit 1; }

mkdir -p "${TARGET_DIR}"
echo "[INFO] tessdata_best の取得先: ${TARGET_DIR}"

for lang in "${LANGS[@]}"; do
  dest="${TARGET_DIR}/${lang}.traineddata"
  if [ -s "${dest}" ]; then
    echo "[INFO] ${lang}.traineddata は取得済み（skip）"
  else
    echo "[INFO] ${lang}.traineddata を取得中..."
    curl -fsSL -o "${dest}" "${BEST_BASE}/${lang}.traineddata"
    echo "[OK] ${lang}.traineddata"
  fi
done

# system tessdata の場所を --list-langs のヘッダ（List of available languages in "<dir>"）から取得する。
sys_tessdata="$(tesseract --list-langs 2>&1 | sed -n 's/.*in "\(.*\)".*/\1/p' | head -1)"
if [ -z "${sys_tessdata}" ] || [ ! -d "${sys_tessdata}" ]; then
  echo "[WARNING] system tessdata の場所を特定できませんでした。configs を手動で ${TARGET_DIR}/ にコピーしてください。"
else
  echo "[INFO] system tessdata: ${sys_tessdata}"
  # tesseract は --tessdata-dir 指定時、txt/tsv 等の config もそのディレクトリから探すため必須。
  if [ -d "${sys_tessdata}/configs" ]; then
    cp -RL "${sys_tessdata}/configs" "${TARGET_DIR}/configs"
    echo "[OK] configs をコピー"
  else
    echo "[WARNING] ${sys_tessdata}/configs が無く txt/tsv 出力が失敗する可能性があります"
  fi
  if [ -d "${sys_tessdata}/tessconfigs" ]; then
    cp -RL "${sys_tessdata}/tessconfigs" "${TARGET_DIR}/tessconfigs"
  fi
  if [ -f "${sys_tessdata}/pdf.ttf" ]; then
    cp -L "${sys_tessdata}/pdf.ttf" "${TARGET_DIR}/" 2>/dev/null || true
  fi
fi

echo "[INFO] 検証: tesseract --tessdata-dir ${TARGET_DIR} --list-langs"
tesseract --tessdata-dir "${TARGET_DIR}" --list-langs
echo "[OK] tessdata_best セットアップ完了: ${TARGET_DIR}"
echo "[INFO] 再OCR 例: bun run tools/medical-care-law-rag/generate-textbook-corpus.ts --tessdata-dir=${TARGET_DIR} --allow-empty-pages"
