/**
 * 전적몬 — 클라우드 동기화(Supabase) 모듈 (트랙 B, 신중 분리)
 *
 * Supabase 클라이언트 로드/생성, Google 로그인, 클라우드 저장/불러오기/충돌 처리를 담당.
 * 렌더링 상태 표시(cloudStatusText/syncTone)와 cloudClient 보관은 app.js에 남겨
 * diagnostics ↔ cloud 간 순환 의존을 끊는다.
 *
 * 노출:
 *  - 브라우저: window.JJM.cloud.createCloud(deps)
 *  - Node(테스트): module.exports 동일
 *
 * data 는 재할당되므로 getData()/setData() 로, cloudClient 도 getCloudClient()/setCloudClient() 로 주입.
 * 동작을 바꾸지 말 것. 로직 변경은 별도 커밋으로.
 */
(function (global) {
  "use strict";

  function createCloud(deps) {
    const {
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      HAS_CLOUD_CONFIG,
      CLOUD_TABLE,
      STORAGE_KEY,
      getCloudClient,
      setCloudClient,
      getData,
      setData,
      state,
      mergeData,
      createDefaultData,
      recordDiagnostic,
      safeJsonSize,
      notifyToast,
      updateAuthControls,
      render,
      dataSummary,
    } = deps;

    // 클라우드 전용 내부 상태 (app.js 에서 이동)
    let supabaseLibraryPromise = null;
    let cloudSaveTimer = null;

    function createCloudClient() {
      if (!window.supabase?.createClient || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }

    function loadSupabaseLibrary() {
      if (window.supabase?.createClient) return Promise.resolve();
      if (supabaseLibraryPromise) return supabaseLibraryPromise;
      supabaseLibraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Supabase 라이브러리를 불러오지 못했습니다."));
        document.head.append(script);
        setTimeout(() => {
          if (!window.supabase?.createClient) reject(new Error("Supabase 라이브러리 연결 시간이 초과되었습니다."));
        }, 10000);
      });
      return supabaseLibraryPromise;
    }

    async function ensureCloudClient() {
      if (getCloudClient()) return getCloudClient();
      if (!HAS_CLOUD_CONFIG) return null;
      await loadSupabaseLibrary();
      setCloudClient(createCloudClient());
      return getCloudClient();
    }

    function comparableData(source) {
      const merged = mergeData(source || createDefaultData());
      delete merged.settings.lastLocalSavedAt;
      return merged;
    }

    function sameData(left, right) {
      return JSON.stringify(comparableData(left)) === JSON.stringify(comparableData(right));
    }

    function setDataFromCloud(nextData) {
      state.suppressCloudSave = true;
      const merged = mergeData(nextData);
      setData(merged);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        state.localSaveError = "";
      } catch (error) {
        console.error(error);
        recordDiagnostic("cloud-local-write-failed", error?.message || "Cloud data local write failed", {
          key: STORAGE_KEY,
          dataBytes: safeJsonSize(merged),
        });
        state.localSaveError = "이 기기 저장 실패";
        notifyToast("이 기기 저장 실패", "클라우드 데이터는 불러왔지만 브라우저 저장에는 실패했습니다.", "danger", 0);
      }
      state.localSavedAt = merged.settings?.lastLocalSavedAt || state.cloudUpdatedAt || "";
      state.suppressCloudSave = false;
    }

    async function fetchCloudRow() {
      const cloudClient = getCloudClient();
      if (!cloudClient || !state.authUser) return null;
      const { data: row, error } = await cloudClient
        .from(CLOUD_TABLE)
        .select("data, updated_at")
        .eq("user_id", state.authUser.id)
        .maybeSingle();
      if (error) throw error;
      return row || null;
    }

    function scheduleCloudSave() {
      if (!getCloudClient() || !state.authUser || !state.cloudReady || state.suppressCloudSave) return;
      clearTimeout(cloudSaveTimer);
      state.cloudError = "";
      state.cloudStatus = "저장 대기 중";
      updateAuthControls();
      cloudSaveTimer = setTimeout(() => {
        saveCloudData();
      }, 700);
    }

    async function saveCloudData(options = {}) {
      const { force = false, notify = false } = options;
      const cloudClient = getCloudClient();
      if (!cloudClient || !state.authUser || state.suppressCloudSave) return false;
      clearTimeout(cloudSaveTimer);
      state.cloudSaving = true;
      state.cloudError = "";
      state.cloudStatus = "클라우드 저장 중";
      updateAuthControls();
      try {
        if (!force && state.cloudUpdatedAt) {
          const row = await fetchCloudRow();
          const remoteTime = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
          const knownTime = state.cloudUpdatedAt ? new Date(state.cloudUpdatedAt).getTime() : 0;
          if (row?.data && remoteTime > knownTime + 500 && !sameData(row.data, getData())) {
            state.cloudSaving = false;
            state.cloudConflict = { data: mergeData(row.data), updatedAt: row.updated_at };
            state.cloudStatus = "다른 기기 변경 감지";
            notifyToast("다른 기기 변경 감지", "클라우드 버전과 이 기기 버전 중 하나를 선택해 주세요.", "warning", 8000);
            render();
            return false;
          }
        }

        const updatedAt = new Date().toISOString();
        const payload = {
          user_id: state.authUser.id,
          data: mergeData(getData()),
          updated_at: updatedAt,
        };
        const { error } = await cloudClient.from(CLOUD_TABLE).upsert(payload, { onConflict: "user_id" });
        if (error) throw error;
        state.cloudUpdatedAt = updatedAt;
        state.cloudConflict = null;
        state.cloudStatus = "클라우드 저장 완료";
        if (notify) notifyToast("동기화 완료", `${dataSummary()} 저장됨`, "success");
        updateAuthControls();
        return true;
      } catch (error) {
        state.cloudSaving = false;
        state.cloudError = "클라우드 저장 실패";
        console.error(error);
        recordDiagnostic("cloud-save-failed", error?.message || "Cloud save failed", {
          code: error?.code || "",
          details: error?.details || "",
        });
        notifyToast("클라우드 저장 실패", "네트워크 또는 Supabase 설정을 확인해 주세요.", "danger", 0, {
          label: "다시 저장",
          action: "retry-cloud-save",
        });
        updateAuthControls();
        return false;
      } finally {
        state.cloudSaving = false;
        updateAuthControls();
      }
    }

    async function loadCloudDataForUser(user) {
      const cloudClient = getCloudClient();
      state.cloudLoading = true;
      state.cloudReady = false;
      state.cloudError = "";
      state.cloudStatus = "클라우드 데이터 확인 중";
      updateAuthControls();
      const { data: row, error } = await cloudClient
        .from(CLOUD_TABLE)
        .select("data, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;

      if (row?.data) {
        const cloudData = mergeData(row.data);
        setDataFromCloud(cloudData);
        state.cloudUpdatedAt = row.updated_at || "";
        state.cloudConflict = null;
        state.cloudStatus = "클라우드에서 불러옴";
        notifyToast("클라우드 데이터 불러옴", dataSummary(cloudData), "success");
      } else {
        state.cloudReady = true;
        state.cloudLoading = false;
        await saveCloudData({ force: true, notify: true });
        render();
        return;
      }

      state.cloudReady = true;
      state.cloudLoading = false;
      render();
    }

    async function applyAuthSession(session) {
      const nextUser = session?.user || null;
      if (!nextUser) {
        clearTimeout(cloudSaveTimer);
        state.authUser = null;
        state.authLoading = false;
        state.cloudReady = false;
        state.cloudLoading = false;
        state.cloudSaving = false;
        state.cloudStatus = "로그인하면 클라우드 데이터 불러오기";
        state.cloudError = "";
        state.cloudConflict = null;
        updateAuthControls();
        return;
      }
      if (state.authUser?.id === nextUser.id && state.cloudReady) {
        state.authUser = nextUser;
        updateAuthControls();
        return;
      }
      state.authUser = nextUser;
      state.authLoading = false;
      try {
        await loadCloudDataForUser(nextUser);
      } catch (error) {
        state.cloudLoading = false;
        state.cloudReady = false;
        state.cloudError = "클라우드 불러오기 실패";
        console.error(error);
        recordDiagnostic("cloud-load-failed", error?.message || "Cloud load failed", {
          userId: nextUser.id,
          code: error?.code || "",
        });
        updateAuthControls();
      }
    }

    async function initializeCloudAuth() {
      try {
        await ensureCloudClient();
      } catch (error) {
        state.authLoading = false;
        state.cloudError = "DB 연결 실패";
        console.error(error);
        recordDiagnostic("cloud-init-failed", error?.message || "Cloud init failed");
        updateAuthControls();
        return;
      }
      const cloudClient = getCloudClient();
      if (!cloudClient) {
        state.authLoading = false;
        updateAuthControls();
        return;
      }
      try {
        const { data: sessionData, error } = await cloudClient.auth.getSession();
        if (error) throw error;
        await applyAuthSession(sessionData.session);
        if (window.location.hash.includes("access_token")) {
          history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }
      } catch (error) {
        state.authLoading = false;
        state.cloudError = "로그인 확인 실패";
        console.error(error);
        updateAuthControls();
      }
      cloudClient.auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED") return;
        applyAuthSession(session);
      });
    }

    async function loginWithGoogle() {
      try {
        await ensureCloudClient();
      } catch (error) {
        state.cloudError = "DB 연결 실패";
        console.error(error);
        updateAuthControls();
      }
      const cloudClient = getCloudClient();
      if (!cloudClient) {
        alert("Supabase 연결 설정을 확인해 주세요.");
        return;
      }
      state.cloudStatus = "Google 로그인으로 이동 중";
      updateAuthControls();
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await cloudClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        state.cloudError = "Google 로그인 시작 실패";
        console.error(error);
        updateAuthControls();
        alert("Google 로그인을 시작하지 못했습니다. Supabase 설정을 확인해 주세요.");
      }
    }

    async function logoutGoogle() {
      const cloudClient = getCloudClient();
      if (!cloudClient) return;
      const saved = await saveCloudData();
      if (state.cloudConflict) {
        alert("다른 기기의 변경이 감지되어 로그아웃 전에 동기화 선택이 필요합니다.");
        return;
      }
      if (!saved && state.cloudError) return;
      const { error } = await cloudClient.auth.signOut();
      if (error) {
        alert("로그아웃에 실패했습니다.");
        console.error(error);
        return;
      }
      await applyAuthSession(null);
      notifyToast("로그아웃 완료", "이 기기에는 로컬 데이터가 남아 있습니다.", "info");
    }

    async function loadCloudNow() {
      const cloudClient = getCloudClient();
      if (!cloudClient || !state.authUser) {
        loginWithGoogle();
        return;
      }
      state.cloudLoading = true;
      state.cloudError = "";
      state.cloudStatus = "클라우드 데이터 불러오는 중";
      updateAuthControls();
      try {
        const row = await fetchCloudRow();
        if (!row?.data) {
          state.cloudLoading = false;
          await saveCloudData({ force: true, notify: true });
          return;
        }
        setDataFromCloud(row.data);
        state.cloudUpdatedAt = row.updated_at || "";
        state.cloudConflict = null;
        state.cloudStatus = "클라우드에서 다시 불러옴";
        state.cloudLoading = false;
        notifyToast("클라우드 데이터 적용", dataSummary(row.data), "success");
        render();
      } catch (error) {
        state.cloudLoading = false;
        state.cloudError = "클라우드 불러오기 실패";
        console.error(error);
        notifyToast("클라우드 불러오기 실패", "잠시 후 다시 시도해 주세요.", "danger", 7000);
        updateAuthControls();
      }
    }

    async function applyCloudConflictVersion() {
      if (!state.cloudConflict) return;
      setDataFromCloud(state.cloudConflict.data);
      state.cloudUpdatedAt = state.cloudConflict.updatedAt || "";
      state.cloudConflict = null;
      state.cloudStatus = "클라우드 버전 적용";
      notifyToast("클라우드 버전 적용", dataSummary(), "success");
      render();
    }

    async function keepLocalConflictVersion() {
      if (!state.cloudConflict) return;
      state.cloudConflict = null;
      await saveCloudData({ force: true, notify: true });
      render();
    }

    return {
      ensureCloudClient,
      setDataFromCloud,
      scheduleCloudSave,
      saveCloudData,
      loadCloudDataForUser,
      applyAuthSession,
      initializeCloudAuth,
      loginWithGoogle,
      logoutGoogle,
      loadCloudNow,
      applyCloudConflictVersion,
      keepLocalConflictVersion,
      comparableData,
      sameData,
    };
  }

  const api = { createCloud };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.JJM = global.JJM || {};
  global.JJM.cloud = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
