#!/usr/bin/env bash
# Shared shell-path classification and pinned-tool activation for bb-theme-builder
# hooks and scripts/check.
#
# Why: pre-commit (staged index) and scripts/check (committed tip / local tree)
# must enforce identical shell-file scope, symlink rejection, and mise tool
# resolution without duplicating logic or modifying verbatim template files
# under .githooks/lib/.

# Git index modes for regular files and symlinks.
# shellcheck disable=SC2034  # Read by callers that source this library.
readonly SHELL_REGULAR_MODES=' 100644 100755 '
# shellcheck disable=SC2034  # Read by callers that source this library.
readonly SHELL_SYMLINK_MODE='120000'

# True when path $1 is a repo-owned shell script (excludes verbatim shared hook
# template files under .githooks/).
is_repo_shell_path() {
	case "$1" in
	.githooks/*/*/*) return 1 ;;
	.githooks/[!.]*.d/[!.]*) return 0 ;;
	.githooks/*) return 1 ;;
	scripts/check | scripts/disposable-runtime | scripts/setup-hooks | *.[Ss][Hh]) return 0 ;;
	*) return 1 ;;
	esac
}

# Resolve pinned tools from trusted tool_root without network auto-install or
# stderr contamination, verify mise.toml parity when checking a detached tip
# worktree, and isolate unpinned mise shims from untrusted worktree configs.
activate_pinned_tools() {
	local tool_root="$1" work_root="$2" caller="$3"
	shift 3
	local resolved_tool_root resolved_work_root tool version bin dir joined=''

	export MISE_AUTO_INSTALL=0
	export MISE_EXEC_AUTO_INSTALL=0

	resolved_tool_root=$(cd -- "$tool_root" && pwd -P)
	resolved_work_root=$(cd -- "$work_root" && pwd -P)

	if [ ! -f "$resolved_tool_root/mise.toml" ] || [ -L "$resolved_tool_root/mise.toml" ]; then
		printf '%s: expected a regular mise.toml\n' "$caller" >&2
		return 1
	fi

	if [ "$resolved_work_root" != "$resolved_tool_root" ]; then
		if [ -L "$resolved_work_root/mise.toml" ]; then
			printf '%s: symlinked mise.toml in pushed commit is not allowed\n' "$caller" >&2
			return 1
		fi
		if [ ! -f "$resolved_work_root/mise.toml" ] || ! cmp -s -- "$resolved_tool_root/mise.toml" "$resolved_work_root/mise.toml"; then
			printf '%s: pushed commit mise.toml differs from working tree; reconcile mise.toml before pushing\n' "$caller" >&2
			return 1
		fi
	fi

	if command -v mise >/dev/null 2>&1; then
		for tool in "$@"; do
			version=$(mise -C "$resolved_tool_root" config get --file "$resolved_tool_root/mise.toml" "tools.$tool" </dev/null) || return 1
			if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
				printf '%s: expected an exact %s version in mise.toml\n' "$caller" "$tool" >&2
				return 1
			fi
			if ! bin=$(mise -C "$resolved_tool_root" which --tool "$tool@$version" "$tool" </dev/null); then
				printf '%s: %s is missing or untrusted in mise.toml; run mise trust && mise install (see README.md)\n' \
					"$caller" "$tool" >&2
				return 1
			fi
			if [ -z "$bin" ] || [ ! -f "$bin" ] || [ ! -x "$bin" ]; then
				printf '%s: resolved %s is not executable: %s\n' "$caller" "$tool" "$bin" >&2
				return 1
			fi
			dir=$(dirname -- "$bin")
			case ":$joined:" in
			*":$dir:"*) ;;
			*) joined="${joined:+$joined:}$dir" ;;
			esac
		done
		if [ -n "$joined" ]; then
			case "$PATH" in
			"$joined" | "$joined":*) ;;
			*) export PATH="$joined:$PATH" ;;
			esac
		fi
	else
		printf '%s: mise is required to resolve pinned tools (see README.md)\n' "$caller" >&2
		return 1
	fi

	if [ "$resolved_work_root" != "$resolved_tool_root" ]; then
		case ":${MISE_IGNORED_CONFIG_PATHS:-}:" in
		*":$resolved_work_root:"*) ;;
		*) export MISE_IGNORED_CONFIG_PATHS="${MISE_IGNORED_CONFIG_PATHS:+$MISE_IGNORED_CONFIG_PATHS:}$resolved_work_root" ;;
		esac
	fi
}
