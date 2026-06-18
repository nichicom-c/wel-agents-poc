#!/bin/bash
# tools/tf/apply-stack.sh <stack>
# Applies a single terraform/aws stack, performing that stack's build / image
# push / cross-stack injection. Reads upstream outputs live, so each stack is
# independently runnable once its upstream stacks are applied.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/tf/lib.sh
source "${DIR}/lib.sh"

# Content hash of the agentcore container-image inputs — the exact set update.md (A) defines:
# packages/agentcore + Dockerfile.agentcore + package.json + bun.lock + tsconfig.json.
# Hashes WORKING-TREE content (git hash-object reads on-disk), so uncommitted edits change
# the hash too. Identical inputs -> identical tag -> no container_uri diff -> AgentCore mints
# NO new runtime version on re-apply; any real image-input change -> new tag -> new version
# (DEFAULT + the bound `sample` endpoint follow). NOT `latest` (silent no-redeploy) and NOT a
# wall-clock timestamp (a new version every apply, churning the documented 1000/agent quota).
# All five inputs MUST be covered: a Dockerfile/dependency change that the hash misses would
# silently fail to redeploy (the `latest` footgun in disguise).
agentcore_image_tag() {
  local paths="packages/agentcore Dockerfile.agentcore package.json bun.lock tsconfig.json"
  local files
  files="$(cd "${REPO_ROOT}" && { git ls-files -- ${paths}; git ls-files --others --exclude-standard -- ${paths}; } | LC_ALL=C sort -u)"
  [ -n "${files}" ] || return 1
  printf '%s\n' "${files}" \
    | ( cd "${REPO_ROOT}" && while IFS= read -r f; do
          [ -f "${f}" ] && printf '%s %s\n' "$(git hash-object "${f}")" "${f}"
        done ) \
    | git -C "${REPO_ROOT}" hash-object --stdin | cut -c1-12
}

apply_agentcore() {
  local engine repo registry region container_uri tag hash
  engine="$(detect_container_engine)" \
    || { echo "[NG] no container engine found (docker/finch/podman)"; exit 1; }
  echo "[INFO] container engine: ${engine}"

  # Derive the image tag from the image-input content hash (see agentcore_image_tag).
  # Passed via -var (CLI > terraform.tfvars > env) to EVERY agentcore apply so step 1, the
  # build/push, and step 3 reference one tag. NB: TF_VAR_image_tag would NOT work — the local
  # terraform.tfvars sets image_tag and tfvars outranks environment variables.
  hash="$(agentcore_image_tag)" \
    || { echo "[NG] agentcore: could not compute image-input content hash (git / paths?)"; exit 1; }
  [ -n "${hash}" ] || { echo "[NG] agentcore: empty image-input content hash"; exit 1; }
  tag="img-${hash}"
  echo "[INFO] agentcore: image tag = ${tag} (content hash of image inputs)"

  tf_init agentcore

  # 1. Create the ECR repository (and the data sources) first, so the image can
  #    be pushed and build_push_commands is available in state.
  echo "[INFO] agentcore: step 1 — create ECR repository"
  tf agentcore apply -auto-approve -var "image_tag=${tag}" \
    -target=aws_ecr_repository.this \
    -target=data.aws_caller_identity.current \
    -target=data.aws_region.current

  # 2. Build (ARM64) and push to the EXACT URI the runtime references. `container_uri`
  #    (terraform output) resolves to <ecr_repo_url>:<tag> via the -var above, or to an
  #    external agent_image_uri. Because the tag IS the content hash, if it already exists
  #    in ECR the inputs are unchanged, so skip the (slow ARM64) build & push entirely.
  repo="$(tf_out_raw agentcore ecr_repository_url)"      # <acct>.dkr.ecr.<region>.amazonaws.com/<name>
  container_uri="$(tf_out_raw agentcore container_uri)"  # <repo>:<tag> OR external agent_image_uri
  region="$(tf_out_raw agentcore region)"
  case "${container_uri}" in
    "${repo}:"*)
      registry="${repo%%/*}"
      if mise exec -- aws ecr describe-images --repository-name "${repo##*/}" \
           --image-ids "imageTag=${tag}" --region "${region}" >/dev/null 2>&1; then
        echo "[INFO] agentcore: step 2 — ${container_uri} already in ECR (inputs unchanged); skipping build/push"
      else
        echo "[INFO] agentcore: step 2 — build & push ${container_uri} (${engine})"
        mise exec -- aws ecr get-login-password --region "${region}" \
          | "${engine}" login --username AWS --password-stdin "${registry}"
        "${engine}" build --platform linux/arm64 -f "${REPO_ROOT}/Dockerfile.agentcore" \
          -t "${container_uri}" "${REPO_ROOT}"
        "${engine}" push "${container_uri}"
      fi
      ;;
    *)
      echo "[INFO] agentcore: step 2 — container_uri is external (${container_uri}); skipping local build/push"
      ;;
  esac

  # 3. Full apply (Runtime / Endpoint / Memory / KBs / S3 / IAM).
  echo "[INFO] agentcore: step 3 — full apply"
  tf agentcore apply -auto-approve -var "image_tag=${tag}"

  # 4. Fire-and-forget KB ingestion / metadata sync (Terraform-external, asynchronous).
  #    Capture the output first so a missing/partial-state output (pipefail under
  #    set -e) does not abort after a successful apply, and so an empty list is
  #    visible rather than a silent zero-iteration loop.
  echo "[INFO] agentcore: step 4 — start ingestion jobs (no wait)"
  local cmds_json n
  cmds_json="$(tf_out_json agentcore start_ingestion_commands)" \
    || { echo "[WARNING] start_ingestion_commands not in state; skipping ingestion"; return 0; }
  n="$(printf '%s' "${cmds_json}" | mise exec -- jq -r 'length' 2>/dev/null || echo 0)"
  echo "[INFO] ingestion jobs to start: ${n}"
  printf '%s' "${cmds_json}" | mise exec -- jq -r '.[]' | while IFS= read -r cmd; do
    echo "[INFO] ingestion: ${cmd}"
    eval "mise exec -- ${cmd}" \
      || echo "[WARNING] ingestion trigger failed (continuing): ${cmd}"
  done
}

apply_auth() {
  tf_init auth
  # site_url exists only after chat-ui has been applied (pass 2). Read it live;
  # inject it as the delta so the local base callback/logout URLs in tfvars stay
  # the single source of truth.
  local site_url
  site_url="$(tf_out_raw chat-ui site_url 2>/dev/null || echo "")"
  if [ -n "${site_url}" ]; then
    echo "[INFO] auth: injecting site_url into callback/logout (${site_url})"
    tf auth apply -auto-approve \
      -var "site_callback_urls=[\"${site_url}\"]" \
      -var "site_logout_urls=[\"${site_url}\"]"
  else
    echo "[INFO] auth: no site_url yet (pass 1) — applying local base callbacks only"
    tf auth apply -auto-approve
  fi
}

apply_bff() {
  tf_init bff
  # Upstream: agentcore.agent_runtime_arn (scalar) + auth.bff_jwt_config (object).
  local arn jwt issuer audience
  arn="$(tf_out_raw agentcore agent_runtime_arn)" \
    || { echo "[NG] bff: apply agentcore first (agent_runtime_arn missing)"; exit 1; }
  jwt="$(tf_out_json auth bff_jwt_config)" \
    || { echo "[NG] bff: apply auth first (bff_jwt_config missing)"; exit 1; }
  issuer="$(printf '%s' "${jwt}" | mise exec -- jq -r '.jwt_issuer')"
  audience="$(printf '%s' "${jwt}" | mise exec -- jq -c '.jwt_audience')"  # HCL-compatible JSON list

  # Optional Dev Info display identifiers for GET /api/dev-info, mirrored from the
  # same agentcore outputs the runtime uses: knowledge_base_ids (map keyed by
  # specialist domain) + memory_id. Non-secret IDs. Reaching here means
  # agentcore is applied (agent_runtime_arn above is required), so these are normally
  # present; still inject each only when non-empty so a partial agentcore state
  # degrades to "not_configured" rather than clobbering it, and a manual
  # terraform.tfvars override survives when the upstream output is absent.
  local kb_json kb_database kb_document kb_law kb_medical_care_law kb_support_activity memory_id
  kb_json="$(tf_out_json agentcore knowledge_base_ids 2>/dev/null || echo '{}')"
  kb_database="$(printf '%s' "${kb_json}" | mise exec -- jq -r '.database // ""')"
  kb_document="$(printf '%s' "${kb_json}" | mise exec -- jq -r '.document // ""')"
  kb_law="$(printf '%s' "${kb_json}" | mise exec -- jq -r '.law // ""')"
  kb_medical_care_law="$(printf '%s' "${kb_json}" | mise exec -- jq -r '.medical_care_law // ""')"
  kb_support_activity="$(printf '%s' "${kb_json}" | mise exec -- jq -r '.support_activity // ""')"
  memory_id="$(tf_out_raw agentcore memory_id 2>/dev/null || echo "")"

  # bash 3.2: expand the array with the ${arr[@]+...} guard so an empty array does
  # not trip `set -u` ("unbound variable") at the apply call below.
  local dev_info_vars=()
  if [ -n "${kb_database}" ]; then dev_info_vars+=(-var "dev_info_database_kb_id=${kb_database}"); fi
  if [ -n "${kb_document}" ]; then dev_info_vars+=(-var "dev_info_document_kb_id=${kb_document}"); fi
  if [ -n "${kb_law}" ]; then dev_info_vars+=(-var "dev_info_law_kb_id=${kb_law}"); fi
  if [ -n "${kb_medical_care_law}" ]; then dev_info_vars+=(-var "dev_info_medical_care_law_kb_id=${kb_medical_care_law}"); fi
  if [ -n "${kb_support_activity}" ]; then dev_info_vars+=(-var "dev_info_support_activity_kb_id=${kb_support_activity}"); fi
  if [ -n "${memory_id}" ]; then dev_info_vars+=(-var "dev_info_agentcore_memory_id=${memory_id}"); fi
  echo "[INFO] bff: dev-info IDs — database=${kb_database:-none} document=${kb_document:-none} law=${kb_law:-none} medical_care_law=${kb_medical_care_law:-none} support_activity=${kb_support_activity:-none} memory=${memory_id:-none}"

  echo "[INFO] bff: build Lambda bundle"
  mise exec -- bun run --cwd "${REPO_ROOT}" build:bff

  echo "[INFO] bff: apply with injected runtime ARN + JWT config + Dev Info IDs"
  tf bff apply -auto-approve \
    -var "agent_runtime_arn=${arn}" \
    -var "jwt_issuer=${issuer}" \
    -var "jwt_audience=${audience}" \
    "${dev_info_vars[@]+"${dev_info_vars[@]}"}"
}

apply_chat_ui() {
  tf_init chat-ui
  # Upstream: bff.chat_ui_origin (object) + auth.chat_ui_auth_env (object, build-time).
  local origin domain path authenv site_url
  origin="$(tf_out_json bff chat_ui_origin)" \
    || { echo "[NG] chat-ui: apply bff first (chat_ui_origin missing)"; exit 1; }
  domain="$(printf '%s' "${origin}" | mise exec -- jq -r '.api_origin_domain_name')"
  path="$(printf '%s' "${origin}" | mise exec -- jq -r '.api_origin_path')"

  authenv="$(tf_out_json auth chat_ui_auth_env)" \
    || { echo "[NG] chat-ui: apply auth first (chat_ui_auth_env missing)"; exit 1; }
  VITE_AUTH_ISSUER="$(printf '%s' "${authenv}" | mise exec -- jq -r '.VITE_AUTH_ISSUER')"
  VITE_AUTH_CLIENT_ID="$(printf '%s' "${authenv}" | mise exec -- jq -r '.VITE_AUTH_CLIENT_ID')"
  VITE_AUTH_SCOPE="$(printf '%s' "${authenv}" | mise exec -- jq -r '.VITE_AUTH_SCOPE')"
  export VITE_AUTH_ISSUER VITE_AUTH_CLIENT_ID VITE_AUTH_SCOPE

  # Pass 1: site_url unknown -> local placeholder. Pass 2: real CloudFront site_url.
  site_url="$(tf_out_raw chat-ui site_url 2>/dev/null || echo "")"
  export VITE_AUTH_REDIRECT_URI="${site_url:-http://localhost:4173}"
  echo "[INFO] chat-ui: VITE_AUTH_REDIRECT_URI=${VITE_AUTH_REDIRECT_URI}"

  echo "[INFO] chat-ui: build UI assets"
  mise exec -- bun run --cwd "${REPO_ROOT}" build:ui

  echo "[INFO] chat-ui: apply with injected api origin"
  tf chat-ui apply -auto-approve \
    -var "api_origin_domain_name=${domain}" \
    -var "api_origin_path=${path}"
}

stack="${1:-}"
preflight_common
case "${stack}" in
  agentcore) apply_agentcore ;;
  auth) apply_auth ;;
  bff) apply_bff ;;
  chat-ui) apply_chat_ui ;;
  *) echo "[NG] usage: apply-stack.sh <agentcore|auth|bff|chat-ui>"; exit 1 ;;
esac
echo "[OK] applied: ${stack}"
