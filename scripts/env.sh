#!/usr/bin/env bash
# Source this file: source scripts/env.sh
tom_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tom_platform="$tom_repo/.tools/linux"
for tom_file in "$tom_platform/node/bin/node" "$tom_platform/llvm/usr/lib/llvm-21/bin/clang" "$tom_platform/llvm/usr/lib/llvm-21/bin/opt"; do
    [[ -x "$tom_file" ]] || { echo 'Missing local tools. Run bash scripts/setup-linux.sh first.' >&2; return 1; }
done
export PATH="$tom_platform/node/bin:$tom_platform/llvm/usr/lib/llvm-21/bin:$tom_platform/cmake/bin:$tom_platform/ninja:$PATH"
export LD_LIBRARY_PATH="$tom_platform/llvm/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CLANG="$tom_platform/llvm/usr/lib/llvm-21/bin/clang"
export LLVM_OPT="$tom_platform/llvm/usr/lib/llvm-21/bin/opt"
mkdir -p "$tom_platform/tmp"
export TMPDIR="$tom_platform/tmp"
