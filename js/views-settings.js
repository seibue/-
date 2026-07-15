/**
 * js/views-settings.js — 설정 탭 뷰(렌더) 함수군.
 * app.js 에서 createSettingsViews(deps) 로 의존성을 주입받아 사용한다.
 * 순수 이동(동작 보존): data.* → getData().* 변경만.
 */
(function (global) {
  function createSettingsViews(deps) {
    const {
      escapeHTML,
      formatSyncTime,
      userEmail,
      cloudStatusText,
      dataSummary,
      cardDataSummary,
      diagnosticStatusInfo,
      backupStatusInfo,
      isAdminUser,
      recoveryStatusInfo,
      serviceStatusTone,
      syncTone,
      state,
      getData,
      APP_VERSION,
    } = deps;

  function renderSettingsView() {
    const recovery = recoveryStatusInfo();
    return `
      <section class="settings-stack">
        ${renderFirstUseGuideCard()}
        ${renderSyncSettingsCard()}
        ${renderDiagnosticsSettingsCard()}
        ${isAdminUser() ? renderServiceStatusCard() : ""}
        <article class="settings-card">
          <h2 class="settings-title">대전 유형 관리</h2>
          ${getData().matchTypes
            .map(
              (type) => `
                <div class="type-row">
                  <span>${escapeHTML(type)}</span>
                  <button class="icon-button" type="button" title="삭제" data-action="delete-type" data-type="${escapeHTML(type)}">×</button>
                </div>
              `
            )
            .join("")}
          <form class="backup-row" id="type-form">
            <input class="input" name="typeName" placeholder="새 유형" aria-label="새 대전 유형 이름" autocomplete="off" />
            <button class="control-button active" type="submit">추가</button>
          </form>
        </article>
        <article class="settings-card">
          <div class="settings-title-row">
            <h2 class="settings-title">내 데이터 백업</h2>
            <span class="sync-badge ${backupStatusInfo().tone}">${escapeHTML(backupStatusInfo().label)}</span>
          </div>
          <div class="mini-text">전적과 덱 데이터를 JSON 파일로 저장하거나, 저장해 둔 백업 파일로 복원합니다. 마지막 백업: ${escapeHTML(backupStatusInfo().detail)}</div>
          <div class="recovery-point">
            <div>
              <strong>${escapeHTML(recovery.label)}</strong>
              <span>${escapeHTML(recovery.detail)}</span>
            </div>
            <button class="control-button" type="button" data-action="restore-recovery-point" ${recovery.available ? "" : "disabled"}>최근 복구 지점 적용</button>
          </div>
          <div class="backup-row">
            <button class="control-button" type="button" data-action="download-backup">백업 파일 저장</button>
            <label class="control-button" style="display: grid; place-items: center; cursor: pointer;">
              백업 파일 불러오기
              <input class="hidden-input" type="file" accept=".json,application/json" data-restore-file />
            </label>
          </div>
        </article>
        ${isAdminUser() ? renderCardDataSettingsCard() : ""}
        ${renderInstallSettingsCard()}
        ${renderContactSettingsCard()}
        <article class="settings-card">
          <h2 class="settings-title" style="color: var(--danger);">위험 구역</h2>
          <div class="mini-text">${state.authUser ? "저장된 모든 전적, 덱, 설정을 이 기기와 클라우드에서 초기화합니다." : "저장된 모든 전적, 덱, 설정을 초기화합니다."}</div>
          <div class="backup-row">
            <button class="danger-button" type="button" data-action="clear-all">전체 삭제</button>
          </div>
        </article>
      </section>
    `;
  }

  function renderContactSettingsCard() {
    return `
      <article class="settings-card">
        <h2 class="settings-title">문의하기</h2>
        <div class="mini-text">앱을 쓰면서 불편한 점이나 버그, 건의사항이 있으면 운영자 X(트위터)로 알려 주세요. 프로필에서 DM 또는 멘션으로 문의할 수 있습니다.</div>
        <div class="backup-row">
          <a class="control-button active" href="https://x.com/Jindory_K_YP" target="_blank" rel="noopener noreferrer" style="display: grid; place-items: center; text-decoration: none;">X로 문의하기 (@Jindory_K_YP)</a>
        </div>
      </article>
    `;
  }

  function renderFirstUseGuideCard() {
    const steps = [
      ["1", "Google 로그인", "PC와 휴대폰에서 같은 데이터를 이어서 사용합니다."],
      ["2", "덱 만들기", "덱 관리를 열고 메인 50장, 디지타마 4~5장까지 구성합니다."],
      ["3", "전적 기록", "사용한 덱, 상대 덱, 승패를 남깁니다."],
      ["4", "통계 확인", "덱 승률과 매치업 승률을 확인합니다."],
      ["5", "백업 보관", "큰 수정 전에는 내 데이터 백업 파일을 저장해 둡니다."],
    ];
    return `
      <article class="settings-card guide-card">
        <div class="settings-title-row">
          <h2 class="settings-title">처음 시작 가이드</h2>
          <span class="sync-badge ok">첫 사용자용</span>
        </div>
        <div class="mini-text">처음 보이는 샘플 덱과 전적은 화면 구성을 보여주기 위한 예시입니다. '샘플 지우기'로 한 번에 정리할 수 있습니다(내 데이터는 유지).</div>
        <div class="guide-steps">
          ${steps
            .map(
              ([number, title, detail]) => `
                <div class="guide-step">
                  <strong>${number}</strong>
                  <div>
                    <span>${escapeHTML(title)}</span>
                    <p>${escapeHTML(detail)}</p>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="backup-row sync-actions">
          <button class="control-button active" type="button" data-action="open-deck">덱 추가로 시작</button>
          <button class="control-button" type="button" data-action="open-match">전적 기록하기</button>
          ${
            [...getData().decks, ...getData().matches, ...getData().tournaments].some((item) => String(item.id || "").startsWith("sample-"))
              ? `<button class="control-button" type="button" data-action="clear-sample-data">샘플 지우기</button>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderServiceStatusCard() {
    const backup = backupStatusInfo();
    const signedIn = Boolean(state.authUser);
    const cardSummary = cardDataSummary();
    const localSaved = formatSyncTime(state.localSavedAt || getData().settings?.lastLocalSavedAt);
    const statusTone = serviceStatusTone();
    const statusLabel = statusTone === "ok" ? "정상" : statusTone === "busy" ? "진행 중" : statusTone === "danger" ? "확인 필요" : "주의";
    return `
      <article class="settings-card service-status-card">
        <div class="settings-title-row">
          <h2 class="settings-title">서비스 상태</h2>
          <span class="sync-badge ${statusTone}">${statusLabel}</span>
        </div>
        <div class="mini-text">운영에 필요한 저장, 백업, 카드 데이터 상태를 한눈에 확인합니다.</div>
        <div class="sync-info-grid service-health-grid">
          <div class="${state.localSaveError ? "danger" : "ok"}">
            <span>이 기기 저장</span>
            <strong>${escapeHTML(state.localSaveError || localSaved || "자동 저장 대기")}</strong>
          </div>
          <div class="${state.cloudError ? "danger" : signedIn ? "ok" : "warn"}">
            <span>클라우드</span>
            <strong>${escapeHTML(signedIn ? cloudStatusText() : "로그인 전")}</strong>
          </div>
          <div class="${backup.tone}">
            <span>마지막 백업</span>
            <strong>${escapeHTML(backup.detail)}</strong>
          </div>
          <div class="ok">
            <span>내 데이터</span>
            <strong>${escapeHTML(dataSummary())}</strong>
          </div>
          <div class="${cardSummary.missingImageCount ? "warn" : "ok"}">
            <span>카드 이미지 키</span>
            <strong>${cardSummary.missingImageCount ? `${cardSummary.missingImageCount.toLocaleString("ko-KR")}장 확인` : "정상"}</strong>
          </div>
          <div class="${cardSummary.effectCount ? "ok" : "warn"}">
            <span>정발 효과</span>
            <strong>${cardSummary.effectCount.toLocaleString("ko-KR")}장</strong>
          </div>
        </div>
        <div class="mini-text">앱 버전: ${escapeHTML(APP_VERSION)}</div>
      </article>
    `;
  }

  function renderDiagnosticsSettingsCard() {
    const status = diagnosticStatusInfo();
    return `
      <article class="settings-card">
        <div class="settings-title-row">
          <h2 class="settings-title">문제 진단</h2>
          <span class="sync-badge ${status.tone}">${escapeHTML(status.label)}</span>
        </div>
        <div class="mini-text">여러 기기에서 오래 쓰다가 생기는 저장, 동기화, 이미지 로딩 문제를 진단 파일로 남깁니다. 문제가 생기면 이 파일만 확인해도 원인을 훨씬 빨리 좁힐 수 있습니다.</div>
        <div class="sync-info-grid">
          <div>
            <span>최근 기록</span>
            <strong>${escapeHTML(status.detail)}</strong>
          </div>
          <div>
            <span>앱 버전</span>
            <strong>${escapeHTML(APP_VERSION)}</strong>
          </div>
          <div>
            <span>네트워크</span>
            <strong>${navigator.onLine ? "온라인" : "오프라인"}</strong>
          </div>
        </div>
        <div class="backup-row sync-actions">
          <button class="control-button active" type="button" data-action="download-diagnostics">진단 파일 저장</button>
          <button class="control-button" type="button" data-action="clear-diagnostics" ${status.count ? "" : "disabled"}>기록 비우기</button>
        </div>
      </article>
    `;
  }

  function renderSyncSettingsCard() {
    const signedIn = Boolean(state.authUser);
    const lastSaved = formatSyncTime(state.cloudUpdatedAt);
    const localSaved = formatSyncTime(state.localSavedAt || getData().settings?.lastLocalSavedAt);
    const backup = backupStatusInfo();
    return `
      <article class="settings-card sync-settings-card">
        <div class="settings-title-row">
          <h2 class="settings-title">계정 / 동기화</h2>
          <span class="sync-badge ${syncTone()}"><span class="sync-dot ${syncTone()}"></span>${escapeHTML(cloudStatusText())}</span>
        </div>
        <div class="sync-info-grid">
          <div>
            <span>계정</span>
            <strong>${escapeHTML(signedIn ? userEmail() || "로그인됨" : "로그인 전")}</strong>
          </div>
          <div>
            <span>저장 데이터</span>
            <strong>${escapeHTML(dataSummary())}</strong>
          </div>
          <div>
            <span>최근 동기화</span>
            <strong>${escapeHTML(lastSaved || "아직 없음")}</strong>
          </div>
          <div>
            <span>이 기기 저장</span>
            <strong>${escapeHTML(localSaved || "자동 저장 전")}</strong>
          </div>
          <div class="${escapeHTML(backup.tone)}">
            <span>백업 상태</span>
            <strong>${escapeHTML(backup.label)} · ${escapeHTML(backup.detail)}</strong>
          </div>
          <div class="${state.cloudError ? "danger" : state.cloudSaving || state.cloudLoading ? "busy" : signedIn ? "ok" : "warn"}">
            <span>저장 상태</span>
            <strong>${escapeHTML(cloudStatusText())}</strong>
          </div>
        </div>
        <div class="backup-row sync-actions">
          ${
            signedIn
              ? `
                <button class="control-button active" type="button" data-action="sync-cloud-now">지금 저장</button>
                <button class="control-button" type="button" data-action="load-cloud-now">클라우드 불러오기</button>
                <button class="control-button" type="button" data-action="logout-google">로그아웃</button>
              `
              : `<button class="primary-action compact" type="button" data-action="login-google">Google 로그인</button>`
          }
        </div>
      </article>
    `;
  }

  function renderInstallSettingsCard() {
    const installed = state.pwaInstalled;
    return `
      <article class="settings-card">
        <div class="settings-title-row">
          <h2 class="settings-title">앱 설치</h2>
          <span class="sync-badge ${installed ? "ok" : "offline"}">${installed ? "설치됨" : "선택 가능"}</span>
        </div>
        <div class="mini-text">${installed ? "홈 화면 앱 모드로 실행 중입니다." : "휴대폰·태블릿·PC 홈 화면에 전적몬을 앱처럼 추가할 수 있습니다."}</div>
        ${
          installed
            ? ""
            : `<div class="backup-row"><button class="control-button active" type="button" data-action="install-pwa">＋ 홈 화면에 추가</button></div>
                ${
                  state.installPrompt
                    ? ""
                    : `<div class="install-guide">
                  <div class="mini-text">버튼을 눌러도 설치 창이 뜨지 않으면, 이 브라우저는 자동 설치를 지원하지 않는 것이니 아래 방법으로 직접 추가하세요.</div>
                  <div class="install-guide-row"><strong>크롬 (안드로이드)</strong><span>우측 상단 메뉴 <b>⋮</b> → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b></span></div>
                  <div class="install-guide-row"><strong>삼성 인터넷 (갤럭시)</strong><span>하단/우측 메뉴 <b>≡</b> → <b>현재 페이지 추가</b> → <b>홈 화면</b></span></div>
                  <div class="install-guide-row"><strong>아이폰·아이패드 (사파리)</strong><span>공유 <b>⬆︎</b> → <b>홈 화면에 추가</b></span></div>
                </div>`
                }`
        }
      </article>
    `;
  }

  function renderCardDataSettingsCard() {
    const summary = cardDataSummary();
    return `
      <article class="settings-card">
        <div class="settings-title-row">
          <h2 class="settings-title">카드 데이터 관리</h2>
          <span class="sync-badge ${summary.missingImageCount ? "warn" : "ok"}">운영자용</span>
        </div>
        <div class="mini-text">신규 카드가 보이지 않거나 이미지/정발 효과가 비어 있을 때, PC에서 갱신 스크립트를 실행한 뒤 GitHub에 파일을 올립니다.</div>
        <div class="sync-info-grid card-data-grid">
          <div>
            <span>카드 카탈로그</span>
            <strong>${summary.catalogCount.toLocaleString("ko-KR")}장</strong>
          </div>
          <div>
            <span>이미지 미등록</span>
            <strong>${summary.missingImageCount.toLocaleString("ko-KR")}장</strong>
          </div>
          <div>
            <span>정발 효과</span>
            <strong>${summary.effectCount.toLocaleString("ko-KR")}장</strong>
          </div>
        </div>
        <div class="mini-text">정발 효과 최근 수집: ${escapeHTML(formatSyncTime(summary.latestEffectFetch) || "기록 없음")}</div>
        <div class="backup-row sync-actions">
          <button class="control-button active" type="button" data-action="copy-card-update-commands">갱신 명령 복사</button>
          <button class="control-button" type="button" data-action="download-card-data-status">상태 파일 저장</button>
        </div>
      </article>
    `;
  }

    return { renderSettingsView, renderContactSettingsCard, renderFirstUseGuideCard, renderServiceStatusCard, renderDiagnosticsSettingsCard, renderSyncSettingsCard, renderInstallSettingsCard, renderCardDataSettingsCard };
  }

  const api = { createSettingsViews };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.JJM = global.JJM || {};
  global.JJM.viewsSettings = api;
})(typeof window !== "undefined" ? window : globalThis);
