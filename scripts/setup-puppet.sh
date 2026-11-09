#!/usr/bin/env bash
# Hand-painted paper puppets: the cutter (src/animation/puppet/cut.py) needs Pillow, NumPy and
# SciPy in its own Python 3.12 (uv, as for Kokoro; the system Python is not touched). ~150 MB.
# The painter is FLUX.2 klein (scripts/setup-imagegen-next.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
TOOLS=vendor/kokoro/tools
[[ -x "$TOOLS/bin/uv" ]] || { mkdir -p vendor/kokoro; python3 -m venv "$TOOLS"; "$TOOLS/bin/pip" install -q uv; }
export UV_PYTHON_INSTALL_DIR="$PWD/vendor/kokoro/python"
"$TOOLS/bin/uv" python install 3.12
[[ -x vendor/puppet/venv/bin/python ]] || "$TOOLS/bin/uv" venv --python 3.12 vendor/puppet/venv
VIRTUAL_ENV="$PWD/vendor/puppet/venv" "$TOOLS/bin/uv" pip install -q pillow numpy scipy
vendor/puppet/venv/bin/python -c "import PIL, numpy, scipy; print('✔ puppet cutter ready', PIL.__version__, numpy.__version__, scipy.__version__)"
