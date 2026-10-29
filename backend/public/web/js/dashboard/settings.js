/** SmartCare dashboard — settings */
(function (SC) {
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;

  function alertBox() {
    return SC.$('#settings-alert');
  }

  function fillProfile(user) {
    if (!user) return;
    const name = SC.$('#settings-name');
    const username = SC.$('#settings-username');
    const email = SC.$('#settings-email');
    const phone = SC.$('#settings-phone');
    if (name) name.value = user.name || '';
    if (username) username.value = user.username || '';
    if (email) email.value = user.email || '';
    if (phone) phone.value = user.phone || '';
    const prefs = user.preferences || {};
    const records = SC.$('#settings-notify-records');
    const schedules = SC.$('#settings-notify-schedules');
    const compact = SC.$('#settings-compact-nav');
    if (records) records.checked = prefs.notify_records !== false;
    if (schedules) schedules.checked = prefs.notify_schedules !== false;
    if (compact) compact.checked = Boolean(prefs.compact_nav) || localStorage.getItem('sc-nav-collapsed') === '1';
    const theme = prefs.theme === 'dark' || prefs.theme === 'light'
      ? prefs.theme
      : (SC.getStoredTheme ? SC.getStoredTheme() : 'light');
    if (SC.setTheme) SC.setTheme(theme);
    else if (SC.syncThemeControls) SC.syncThemeControls(theme);
    renderAvatarPreview(user);
  }

  function canUploadAvatar(user = SC.state.currentUser) {
    const role = SC.roleValueOf(user);
    return role === 'head_doctor' || role === 'psychometrician';
  }

  function renderAvatarPreview(user = SC.state.currentUser) {
    const block = SC.$('#settings-avatar-block');
    const preview = SC.$('#settings-avatar-preview');
    const removeBtn = SC.$('#settings-avatar-remove');
    if (!block || !preview) return;

    if (!canUploadAvatar(user)) {
      block.hidden = true;
      return;
    }

    block.hidden = false;
    const url = SC.userAvatarUrl(user);
    if (url) {
      preview.classList.add('has-photo');
      preview.innerHTML = `<img src="${SC.escapeHtml(url)}" alt="">`;
    } else {
      preview.classList.remove('has-photo');
      preview.textContent = SC.initialsFromName(user?.name);
    }
    if (removeBtn) removeBtn.hidden = !user?.avatar_url;
  }

  async function uploadAvatar(file) {
    const alertEl = alertBox();
    const body = new FormData();
    body.append('photo', file);
    const user = await SmartCareAPI.post('/me/avatar', body);
    SC.state.currentUser = user;
    SmartCareAuth.setStoredUser(user);
    renderAvatarPreview(user);
    if (SC.renderUserBadge) SC.renderUserBadge(user);
    else if (SC.loadMe) await SC.loadMe();
    showAlert(alertEl, 'Profile photo updated.', 'success');
  }

  async function removeAvatar() {
    const alertEl = alertBox();
    const user = await SmartCareAPI.delete('/me/avatar');
    SC.state.currentUser = user;
    SmartCareAuth.setStoredUser(user);
    renderAvatarPreview(user);
    if (SC.renderUserBadge) SC.renderUserBadge(user);
    else if (SC.loadMe) await SC.loadMe();
    showAlert(alertEl, 'Profile photo removed.', 'success');
  }

  function fillWorkspace(settings) {
    SC.state.workspace = settings || {};
    const facility = SC.$('#settings-facility');
    const tz = SC.$('#settings-timezone');
    const mins = SC.$('#settings-session-minutes');
    const lead = SC.$('#settings-reminder-lead');
    if (facility) facility.value = settings.facility_name || 'Malvar Assisted Facility';
    if (tz) {
      const value = settings.timezone || 'Asia/Manila';
      if (![...tz.options].some((opt) => opt.value === value)) {
        tz.add(new Option(value, value));
      }
      tz.value = value;
    }
    if (mins) mins.value = settings.default_session_minutes || '60';
    if (lead) lead.value = settings.reminder_lead_minutes || '0';
    const label = SC.$('.sidebar-facility');
    if (label) label.textContent = settings.facility_name || 'Malvar Assisted Facility';
    const canEdit = SC.isHeadDoctor();
    const save = SC.$('#settings-workspace-save');
    if (save) save.hidden = !canEdit;
    SC.$('#settings-workspace-form')?.querySelectorAll('input, select').forEach((el) => {
      el.disabled = !canEdit;
    });
  }

  async function loadSettings() {
    fillProfile(SC.state.currentUser);
    try {
      const settings = await SmartCareAPI.get('/workspace');
      fillWorkspace(settings);
    } catch {
      fillWorkspace({
        facility_name: 'Malvar Assisted Facility',
        timezone: 'Asia/Manila',
        default_session_minutes: '60',
        reminder_lead_minutes: '0',
      });
    }
  }

  function initSettings() {
    const profileForm = SC.$('#settings-profile-form');
    if (!profileForm || profileForm.dataset.bound === '1') return;
    profileForm.dataset.bound = '1';

    let pendingVerifyEmail = '';
    let expiresMinutes = 15;
    const verifyModal = SC.$('#settings-verify-modal');
    const verifyCopy = SC.$('#settings-verify-copy');
    const verifyEmailEl = SC.$('#settings-verify-email');
    const verifyStatus = SC.$('#settings-verify-status');
    const verifyResend = SC.$('#settings-verify-resend');

    function showEmailVerifyModal(result, email) {
      pendingVerifyEmail = email;
      expiresMinutes = Number(result.expires_minutes) || 15;
      if (verifyEmailEl) verifyEmailEl.textContent = email;
      if (verifyCopy) {
        verifyCopy.innerHTML = result.mail_sent
          ? `We sent a verification link to your new address. It is valid for <strong>${expiresMinutes} minutes</strong>. After verifying, sign in with that Google account.`
          : `Your email was updated. Check your inbox for the verification link — it is valid for <strong>${expiresMinutes} minutes</strong>. If you do not see it, tap Resend. Then sign in with Google.`;
      }
      if (verifyStatus) {
        verifyStatus.hidden = true;
        verifyStatus.textContent = '';
      }
      if (verifyModal?.showModal) verifyModal.showModal();
      else if (verifyModal) verifyModal.setAttribute('open', 'open');
    }

    async function resendEmailVerification() {
      if (!pendingVerifyEmail || !verifyResend) return;
      verifyResend.disabled = true;
      verifyResend.textContent = 'Sending…';
      if (verifyStatus) verifyStatus.hidden = true;
      try {
        const result = await SmartCareAPI.post('/email/resend');
        expiresMinutes = Number(result.expires_minutes) || expiresMinutes;
        if (verifyStatus) {
          verifyStatus.hidden = false;
          verifyStatus.className = 'verify-modal__status is-success';
          verifyStatus.textContent = result.message || `A new link was sent. Valid for ${expiresMinutes} minutes.`;
        }
        if (verifyCopy) {
          verifyCopy.innerHTML = `Verification link is valid for <strong>${expiresMinutes} minutes</strong>. After verifying, continue with Google.`;
        }
      } catch (err) {
        if (verifyStatus) {
          verifyStatus.hidden = false;
          verifyStatus.className = 'verify-modal__status is-error';
          verifyStatus.textContent = err.message || 'Could not resend verification link.';
        }
      } finally {
        verifyResend.disabled = false;
        verifyResend.textContent = 'Resend link';
      }
    }

    verifyResend?.addEventListener('click', resendEmailVerification);

    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = alertBox();
      try {
        await SC.withBusy({ button: e.submitter, busyLabel: 'Saving…' }, async () => {
          const result = await SmartCareAPI.put('/me', {
            name: SC.$('#settings-name').value.trim(),
            username: SC.$('#settings-username').value.trim(),
            email: SC.$('#settings-email').value.trim(),
            phone: SC.$('#settings-phone').value.trim() || null,
          });
          const user = result.user || result;
          SC.state.currentUser = user;
          SmartCareAuth.setStoredUser(user);
          fillProfile(user);
          if (SC.renderUserBadge) SC.renderUserBadge(user);
          if (result.email_changed) {
            hideAlert(alertEl);
            showEmailVerifyModal(result, user.email);
          } else {
            showAlert(alertEl, result.message || 'Profile saved.', 'success');
          }
        });
      } catch (err) {
        showAlert(alertEl, err.message || 'Could not save profile.', 'error');
      }
    });

    SC.$('#settings-avatar-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const alertEl = alertBox();
      const uploadLabel = document.querySelector('label[for="settings-avatar-input"]');
      try {
        await SC.withBusy({ button: uploadLabel }, async () => {
          await uploadAvatar(file);
        });
      } catch (err) {
        const detail = err?.data?.errors?.photo?.[0];
        showAlert(alertEl, detail || err.message || 'Could not upload photo.', 'error');
      }
    });

    SC.$('#settings-avatar-remove')?.addEventListener('click', async (e) => {
      const alertEl = alertBox();
      try {
        await SC.withBusy({ button: e.currentTarget, busyLabel: 'Removing…' }, async () => {
          await removeAvatar();
        });
      } catch (err) {
        showAlert(alertEl, err.message || 'Could not remove photo.', 'error');
      }
    });

    SC.$('#settings-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = alertBox();
      const next = SC.$('#settings-new-password').value;
      const confirm = SC.$('#settings-new-password-confirm').value;
      if (next !== confirm) {
        showAlert(alertEl, 'New passwords do not match.', 'error');
        return;
      }
      try {
        await SC.withBusy({ button: e.submitter, busyLabel: 'Updating…' }, async () => {
          const result = await SmartCareAPI.put('/me/password', {
            current_password: SC.$('#settings-current-password').value,
            password: next,
            password_confirmation: confirm,
          });
          SC.$('#settings-password-form').reset();
          showAlert(alertEl, result.message || 'Password updated.', 'success');
        });
      } catch (err) {
        showAlert(alertEl, err.message || 'Could not update password.', 'error');
      }
    });

    SC.$('#settings-prefs-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = alertBox();
      const compact = SC.$('#settings-compact-nav')?.checked;
      try {
        await SC.withBusy({ button: e.submitter, busyLabel: 'Saving…' }, async () => {
          const themeInput = document.querySelector('input[name="settings-theme"]:checked');
          const theme = themeInput?.value === 'dark' ? 'dark' : 'light';
          const user = await SmartCareAPI.put('/me/preferences', {
            notify_records: Boolean(SC.$('#settings-notify-records')?.checked),
            notify_schedules: Boolean(SC.$('#settings-notify-schedules')?.checked),
            compact_nav: Boolean(compact),
            theme,
          });
          SC.state.currentUser = user;
          SmartCareAuth.setStoredUser(user);
          SC.setNavCollapsed?.(Boolean(compact));
          SC.setTheme?.(theme);
          showAlert(alertEl, 'Display preferences saved.', 'success');
        });
      } catch (err) {
        showAlert(alertEl, err.message || 'Could not save preferences.', 'error');
      }
    });

    SC.$('#settings-logout-others')?.addEventListener('click', async () => {
      const alertEl = alertBox();
      try {
        const result = await SmartCareAPI.post('/me/logout-others');
        showAlert(alertEl, result.message || 'Other devices were signed out.', 'success');
      } catch (err) {
        showAlert(alertEl, err.message || 'Could not sign out other devices.', 'error');
      }
    });

    SC.$('#settings-workspace-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = alertBox();
      if (!SC.isHeadDoctor()) return;
      try {
        await SC.withBusy({ button: e.submitter || '#settings-workspace-save', busyLabel: 'Saving…' }, async () => {
          const settings = await SmartCareAPI.put('/workspace', {
            facility_name: SC.$('#settings-facility').value.trim(),
            timezone: SC.$('#settings-timezone').value,
            default_session_minutes: Number(SC.$('#settings-session-minutes').value),
            reminder_lead_minutes: Number(SC.$('#settings-reminder-lead').value),
          });
          fillWorkspace(settings);
          showAlert(alertEl, 'Facility settings saved.', 'success');
        });
      } catch (err) {
        showAlert(alertEl, err.message || 'Could not save facility settings.', 'error');
      }
    });
  }

  SC.initSettings = initSettings;
  SC.loadSettings = loadSettings;
  SC.defaultSessionMinutes = function () {
    return Number(SC.state.workspace?.default_session_minutes || 60);
  };
})(window.SmartCareApp);
