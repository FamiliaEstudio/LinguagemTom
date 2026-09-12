#!/usr/bin/env bash
# Ubuntu/Debian x64, with LLVM 21.1.8 available in the configured APT indexes.
# Packages are downloaded and extracted locally; no sudo or dpkg installation.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
platform="$repo/.tools/linux"
cache="$repo/.tools/downloads"
[[ $(uname -m) == x86_64 ]] || { echo 'Requires Linux/WSL x64.' >&2; exit 1; }
for tool in python3 curl tar xz sha256sum apt-get apt-cache dpkg-deb gcc ld; do
    command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool (see scripts/README.md)." >&2; exit 1; }
done
mkdir -p "$platform" "$cache"
mapfile -t node_spec < <(python3 - "$repo/scripts/toolchain.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
for key in ('url', 'file', 'sha256'):
    print(c['nodeLinux'][key])
print(c['llvmVersion'])
PY
)
archive="$cache/${node_spec[1]}"
if [[ ! -f "$archive" ]]; then
    curl -fL --retry 3 --connect-timeout 30 "${node_spec[0]}" -o "$archive.partial"
    printf '%s  %s\n' "${node_spec[2]}" "$archive.partial" | sha256sum -c -
    mv -- "$archive.partial" "$archive"
fi
printf '%s  %s\n' "${node_spec[2]}" "$archive" | sha256sum -c -
staging=$(mktemp -d "$platform/setup.XXXXXXXX")
trap 'rm -rf -- "$staging"' EXIT
if [[ -f "$platform/node/.tom-sha256" ]]; then
    [[ $(< "$platform/node/.tom-sha256") == "${node_spec[2]}" ]] || {
        echo 'Local Node differs from the manifest; remove .tools/linux/node and retry.' >&2
        exit 1
    }
else
    [[ ! -e "$platform/node" ]] || { echo 'Unexpected existing node directory.' >&2; exit 1; }
    mkdir "$staging/node"
    tar -xf "$archive" -C "$staging/node" --strip-components=1
    printf '%s\n' "${node_spec[2]}" > "$staging/node/.tom-sha256"
    mv -- "$staging/node" "$platform/node"
fi
if [[ -f "$platform/llvm/.tom-packages" ]]; then
    installed_clang=$(head -n 1 "$platform/llvm/.tom-packages")
    [[ "$installed_clang" == clang-21=*"${node_spec[3]}"* ]] || {
        echo 'Local LLVM differs from the manifest; remove .tools/linux/llvm and retry.' >&2
        exit 1
    }
else
    [[ ! -e "$platform/llvm" ]] || { echo 'Unexpected existing llvm directory.' >&2; exit 1; }
    mkdir "$staging/packages" "$staging/llvm"
    packages=(clang-21 llvm-21 libllvm21 libclang-cpp21 libclang-common-21-dev libclang1-21)
    pinned=()
    for package in "${packages[@]}"; do
        version=$(LC_ALL=C apt-cache policy "$package" | awk '/Candidate:/ {print $2}')
        if [[ "$version" != *"${node_spec[3]}"* ]]; then
            echo "APT needs $package ${node_spec[3]}; found: $version. See scripts/README.md." >&2
            exit 1
        fi
        pinned+=("$package=$version")
    done
    (cd "$staging/packages" && apt-get download "${pinned[@]}")
    for package_file in "$staging/packages/"*.deb; do
        dpkg-deb -x "$package_file" "$staging/llvm"
    done
    printf '%s\n' "${pinned[@]}" > "$staging/llvm/.tom-packages"
    (cd "$staging/packages" && sha256sum ./*.deb) >> "$staging/llvm/.tom-packages"
    mv -- "$staging/llvm" "$platform/llvm"
fi
source "$repo/scripts/env.sh"
node --version
"$CLANG" --version
"$LLVM_OPT" --version
node "$repo/scripts/setup-native.js"
echo 'Ready. Activate with: source scripts/env.sh'
