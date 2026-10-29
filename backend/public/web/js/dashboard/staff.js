/** SmartCare dashboard — staff directory */
(function (SC) {
  const formatRole = SC.formatRole;
  const isHeadDoctor = SC.isHeadDoctor;
  const initialsFromName = SC.initialsFromName;
  const openModal = SC.openModal;
  const closeModal = SC.closeModal;
  const escapeHtml = SC.escapeHtml;
  const formatDate = SC.formatDate;
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;

  const NEW_DAYS = 7;
  const ICONS = {
    view: 'user-round',
    role: 'shield',
    password: 'key-round',
    access: 'user-cog',
    delete: 'trash-2',
  };

  let staffCache = [];
  let activityCache = [];
  let analyticsCache = null;
  let activeUserId = null;
  let activeAction = 'view';
  let staffPage = 1;
  const STAFF_PAGE_SIZE = 10;

  function roleValue(user) {
    const role = user?.role;
    if (!role) return '';
    if (typeof role === 'object') return role.value || '';
    return String(role);
  }

  function isActive(user) {
    return (user?.status || 'active') !== 'inactive';
  }

  function isNewAccount(user) {
    if (!user?.created_at) return false;
    const created = new Date(user.created_at).getTime();
    return Date.now() - created <= NEW_DAYS * 24 * 60 * 60 * 1000;
  }

  function currentUserId() {
    return SC.state.currentUser?.id;
  }

  function findUser(id) {
    return staffCache.find((u) => String(u.id) === String(id));
  }

  function childLabel(child) {
    return `${child.first_name || ''} ${child.last_name || ''}`.trim() || 'Child';
  }

  function renderAnalytics() {
    const hint = SC.$('#staff-summary-line');
    const activityPanel = SC.$('#staff-activity-panel');
    const activityBody = SC.$('#staff-activity');
    const stats = analyticsCache || {
      total: staffCache.length,
      active: staffCache.filter(isActive).length,
      inactive: staffCache.filter((u) => !isActive(u)).length,
      new_last_7_days: staffCache.filter(isNewAccount).length,
      new_last_14_days: staffCache.filter(isNewAccount).length,
    };

    if (hint) {
      hint.textContent = `${stats.total ?? 0} accounts · ${stats.active ?? 0} active · ${stats.new_last_7_days ?? stats.new_last_14_days ?? 0} new · ${stats.inactive ?? 0} inactive`;
    }

    if (!activityPanel || !activityBody) return;
    if (!activityCache.length) {
      activityPanel.hidden = true;
      return;
    }
    activityPanel.hidden = false;
    activityBody.innerHTML = activityCache
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(activityCopy(row))}</td>
          <td class="staff-table__muted">${escapeHtml(formatDate(row.created_at))}</td>
        </tr>`
      )
      .join('');
  }

  function isVerified(user) {
    return Boolean(user?.email_verified_at);
  }

  function activityCopy(row) {
    const actor = row.user?.name || row.user?.username || 'Head Doctor';
    const target = row.meta?.target_name || 'a user';
    switch (row.action) {
      case 'user.created':
        return `${actor} created an account for ${target}`;
      case 'user.verification_resent':
        return `${actor} resent verification email to ${target}`;
      case 'user.role_changed':
        return `${actor} set ${target} to ${formatRole(row.meta?.to || '')}`;
      case 'user.password_reset':
        return `${actor} reset ${target}’s password`;
      case 'user.deactivated':
        return `${actor} deactivated ${target}`;
      case 'user.activated':
        return `${actor} reactivated ${target}`;
      case 'user.deleted':
        return `${actor} deleted ${target}`;
      default:
        return `${actor} updated ${target}`;
    }
  }

  function filteredStaff() {
    const query = (SC.$('#staff-search')?.value || '').trim().toLowerCase();
    const role = SC.$('#staff-role-filter')?.value || '';
    const status = SC.$('#staff-status-filter')?.value || '';
    return staffCache.filter((u) => {
      const hay = `${u.name || ''} ${u.email || ''} ${u.username || ''}`.toLowerCase();
      if (query && !hay.includes(query)) return false;
      if (role && roleValue(u) !== role) return false;
      if (status === 'active' && !isActive(u)) return false;
      if (status === 'inactive' && isActive(u)) return false;
      if (status === 'new' && !isNewAccount(u)) return false;
      return true;
    });
  }

  function renderDirectory({ scrollToTop = false } = {}) {
    const wrap = SC.$('#staff-table-wrap');
    const tbody = SC.$('#staff-tbody');
    const empty = SC.$('#staff-empty');
    const wrapCount = SC.$('#staff-toolbar-count');
    const pagination = SC.$('#staff-pagination');
    if (!wrap || !tbody || !empty) return;

    const rows = filteredStaff();
    const pageData = SC.paginate(rows, staffPage, STAFF_PAGE_SIZE);
    staffPage = pageData.page;
    if (wrapCount) wrapCount.textContent = String(rows.length);

    if (!rows.length) {
      wrap.hidden = true;
      empty.hidden = false;
      if (pagination) pagination.hidden = true;
      empty.querySelector('h3').textContent = staffCache.length ? 'No matching accounts' : 'No staff loaded';
      empty.querySelector('p').textContent = staffCache.length
        ? 'Try another search or filter.'
        : 'Registered users will appear here so you can assign roles.';
      return;
    }

    empty.hidden = true;
    wrap.hidden = false;
    tbody.innerHTML = pageData.items
      .map((u) => {
        const role = roleValue(u);
        const active = isActive(u);
        const fresh = isNewAccount(u);
        const mine = String(u.id) === String(currentUserId());
        const name = u.name || 'Unnamed';
        return `
          <tr class="${active ? '' : 'is-inactive'}${fresh ? ' is-new' : ''}" data-user-id="${u.id}">
            <td>
              <div class="staff-identity">
                ${SC.avatarMarkup(u, { className: 'staff-avatar', name })}
                <span>
                  <strong>${escapeHtml(name)}</strong>
                  ${fresh ? '<span class="staff-chip-new">New</span>' : ''}
                  ${mine ? '<span class="staff-chip-you">You</span>' : ''}
                  <small>${escapeHtml(u.username || '—')} · ${escapeHtml(u.email || 'No email')}</small>
                </span>
              </div>
            </td>
            <td><span class="badge-role">${escapeHtml(formatRole(role))}</span></td>
            <td><span class="badge-status${active ? '' : ' badge-status--inactive'}">${active ? 'Active' : 'Inactive'}</span>${!isVerified(u) ? ' <span class="staff-chip-new">Unverified</span>' : ''}</td>
            <td class="staff-table__muted">${escapeHtml(formatDate(u.created_at))}</td>
            <td>
              <div class="row-actions">
                <button type="button" class="icon-btn icon-btn--sm" data-staff-action="view" data-user-id="${u.id}" title="View details" aria-label="View details for ${escapeHtml(name)}">
                  ${SC.icon('eye', { size: 16 })}
                </button>
                <button type="button" class="icon-btn icon-btn--sm" data-staff-action="role" data-user-id="${u.id}" title="Change role" aria-label="Change role for ${escapeHtml(name)}">
                  ${SC.icon('shield', { size: 16 })}
                </button>
                <button type="button" class="icon-btn icon-btn--sm" data-staff-action="password" data-user-id="${u.id}" title="Reset password" aria-label="Reset password for ${escapeHtml(name)}">
                  ${SC.icon('key-round', { size: 16 })}
                </button>
                <button type="button" class="icon-btn icon-btn--sm" data-staff-action="access" data-user-id="${u.id}" title="Account access" aria-label="Manage access for ${escapeHtml(name)}">
                  ${SC.icon('user-cog', { size: 16 })}
                </button>
                ${mine ? '' : `<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-staff-action="delete" data-user-id="${u.id}" title="Delete user" aria-label="Delete ${escapeHtml(name)}">
                  ${SC.icon('trash-2', { size: 16 })}
                </button>`}
              </div>
            </td>
          </tr>`;
      })
      .join('');

    SC.renderPaginationControls({
      nav: pagination,
      prev: SC.$('#staff-page-prev'),
      next: SC.$('#staff-page-next'),
      meta: SC.$('#staff-page-meta'),
      page: pageData.page,
      totalPages: pageData.totalPages,
      from: pageData.from,
      to: pageData.to,
      total: pageData.total,
    });

    if (scrollToTop) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setPanel(name) {
    SC.$$('.staff-modal-panel').forEach((panel) => {
      panel.hidden = panel.id !== `staff-panel-${name}`;
    });
  }

  function fillDetails(user) {
    const children = user.children || [];
    const list = SC.$('#staff-detail-list');
    const badges = SC.$('#staff-profile-badges');
    if (!list) return;

    const active = isActive(user);
    const verified = isVerified(user);
    const role = formatRole(roleValue(user));

    if (badges) {
      badges.hidden = false;
      badges.innerHTML = `
        <span class="staff-profile__pill staff-profile__pill--role">${escapeHtml(role)}</span>
        <span class="staff-profile__pill ${active ? 'staff-profile__pill--ok' : 'staff-profile__pill--muted'}">
          <span class="staff-profile__dot" aria-hidden="true"></span>
          ${active ? 'Active' : 'Inactive'}
        </span>
        <span class="staff-profile__pill ${verified ? 'staff-profile__pill--ok' : 'staff-profile__pill--warn'}">
          ${verified ? 'Verified' : 'Unverified'}
        </span>
        ${isNewAccount(user) ? '<span class="staff-profile__pill staff-profile__pill--new">New</span>' : ''}
      `;
    }

    const childItems = children.length
      ? children
          .map(
            (c) => `
          <li class="staff-profile__child">
            <span class="staff-profile__child-avatar" aria-hidden="true">${escapeHtml(initialsFromName(childLabel(c)))}</span>
            <span class="staff-profile__child-name">${escapeHtml(childLabel(c))}</span>
          </li>`
          )
          .join('')
      : '<li class="staff-profile__empty">No children assigned to this account yet.</li>';

    list.innerHTML = `
      <div class="staff-profile__panel">
        <div class="staff-profile__split">
          <section class="staff-profile__section" aria-labelledby="staff-profile-account">
            <h4 class="staff-profile__heading" id="staff-profile-account">Account</h4>
            <dl class="staff-profile__fields staff-profile__fields--stack">
              <div class="staff-profile__field">
                <dt>Username</dt>
                <dd>${escapeHtml(user.username || '—')}</dd>
              </div>
              <div class="staff-profile__field">
                <dt>Email</dt>
                <dd>${escapeHtml(user.email || '—')}</dd>
              </div>
              <div class="staff-profile__field">
                <dt>Registered</dt>
                <dd>${escapeHtml(formatDate(user.created_at))}</dd>
              </div>
            </dl>
          </section>
          <section class="staff-profile__section" aria-labelledby="staff-profile-access">
            <h4 class="staff-profile__heading" id="staff-profile-access">Access</h4>
            <dl class="staff-profile__fields staff-profile__fields--stack">
              <div class="staff-profile__field">
                <dt>Role</dt>
                <dd>${escapeHtml(role)}</dd>
              </div>
              <div class="staff-profile__field">
                <dt>Status</dt>
                <dd>${active ? 'Active — can sign in' : 'Inactive — sign-in blocked'}</dd>
              </div>
              <div class="staff-profile__field">
                <dt>Verification</dt>
                <dd>${verified ? 'Email confirmed' : 'Awaiting email confirmation'}</dd>
              </div>
            </dl>
          </section>
        </div>
        <section class="staff-profile__section staff-profile__section--children" aria-labelledby="staff-profile-children">
          <div class="staff-profile__children-head">
            <div class="staff-profile__children-title">
              <h4 class="staff-profile__heading" id="staff-profile-children">Assigned children</h4>
              <span class="staff-profile__count">${children.length}</span>
            </div>
            ${
              ['teacher', 'parent', 'caretaker'].includes(roleValue(user))
                && typeof SC.isHeadDoctor === 'function'
                && SC.isHeadDoctor()
                ? `<button type="button" class="btn btn-secondary btn-sm staff-profile__assign" data-staff-assign="${user.id}" data-staff-assign-role="${escapeHtml(roleValue(user))}">Assign children</button>`
                : ''
            }
          </div>
          <ul class="staff-profile__children">${childItems}</ul>
        </section>
      </div>`;
  }

  function setStaffFace(user, action) {
    const avatar = SC.$('#modal-staff-avatar');
    const iconWrap = SC.$('#modal-staff-icon-wrap');
    const showAvatar = action === 'view';
    if (avatar) {
      avatar.hidden = !showAvatar;
      if (showAvatar) SC.fillAvatarEl(avatar, user);
      else {
        avatar.classList.remove('has-photo');
        avatar.textContent = '';
      }
    }
    if (iconWrap) {
      iconWrap.hidden = showAvatar;
      if (!showAvatar) {
        iconWrap.innerHTML = SC.icon(ICONS[action] || 'user-round', { size: 22 });
      }
    }
  }

  function setFooter(buttonsHtml) {
    const actions = SC.$('#staff-modal-actions');
    if (actions) actions.innerHTML = buttonsHtml;
  }

  function openStaffModal(action, userId) {
    const alertEl = SC.$('#staff-modal-alert');
    hideAlert(alertEl);
    activeAction = action;

    const title = SC.$('#modal-staff-title');
    const subtitle = SC.$('#modal-staff-subtitle');
    const dismiss = SC.$('#staff-modal-dismiss');
    const dialog = SC.$('#modal-staff');
    if (dialog) dialog.dataset.staffMode = action;

    if (action === 'delete') {
      const user = findUser(userId);
      if (!user) return;
      if (String(user.id) === String(currentUserId())) {
        window.alert('You cannot delete your own account.');
        return;
      }
      activeUserId = user.id;
      const ok = window.confirm(
        `Permanently delete ${user.name || 'this user'} (${user.email || user.username || 'no email'})?\n\nThis cannot be undone and frees the email for re-registration.`,
      );
      if (!ok) return;
      (async () => {
        try {
          await SC.withBusy({ section: SC.$('#staff-loading') }, async () => {
            await SmartCareAPI.delete(`/users/${user.id}`);
            await loadStaff({ force: true });
          });
        } catch (err) {
          window.alert(errorMessage(err));
        }
      })();
      return;
    }

    if (action === 'create') {
      activeUserId = null;
      if (title) title.textContent = 'Create account';
      if (subtitle) subtitle.textContent = 'Set up login credentials and send a verification email.';
      if (dismiss) dismiss.textContent = 'Cancel';
      const badges = SC.$('#staff-profile-badges');
      if (badges) {
        badges.hidden = true;
        badges.innerHTML = '';
      }
      const iconWrap = SC.$('#modal-staff-icon-wrap');
      const avatar = SC.$('#modal-staff-avatar');
      if (avatar) {
        avatar.hidden = true;
        avatar.classList.remove('has-photo');
        avatar.textContent = '';
      }
      if (iconWrap) iconWrap.hidden = false;
      ['staff-create-name', 'staff-create-email', 'staff-create-username', 'staff-create-password', 'staff-create-password-confirm'].forEach((id) => {
        const el = SC.$(`#${id}`);
        if (el) el.value = '';
      });
      const roleSelect = SC.$('#staff-create-role');
      if (roleSelect) roleSelect.value = 'teacher';
      clearCreateFieldErrors();
      hideAlert(SC.$('#staff-modal-alert'));
      setPanel('create');
      setFooter('<button type="submit" class="btn btn-primary" form="staff-panel-create">Create account</button>');
      openModal('modal-staff');
      return;
    }

    const user = findUser(userId);
    if (!user) return;
    activeUserId = user.id;
    setStaffFace(user, action);
    if (dismiss) dismiss.textContent = action === 'view' ? 'Close' : 'Cancel';

    if (action === 'view') {
      if (title) title.textContent = user.name || 'Account details';
      if (subtitle) subtitle.textContent = 'Facility account profile';
      fillDetails(user);
      setPanel('view');
      const resendBtn = !isVerified(user)
        ? '<button type="button" class="btn btn-secondary" data-staff-commit="resend-verification">Resend verification email</button>'
        : '';
      setFooter(resendBtn);
    } else if (action === 'role') {
      const badges = SC.$('#staff-profile-badges');
      if (badges) {
        badges.hidden = true;
        badges.innerHTML = '';
      }
      if (title) title.textContent = 'Change role';
      if (subtitle) subtitle.textContent = `Assign a role for ${user.name}.`;
      const select = SC.$('#staff-role-select');
      if (select) select.value = roleValue(user);
      setPanel('role');
      setFooter('<button type="submit" class="btn btn-primary" form="staff-panel-role">Save role</button>');
    } else if (action === 'password') {
      const badges = SC.$('#staff-profile-badges');
      if (badges) {
        badges.hidden = true;
        badges.innerHTML = '';
      }
      if (title) title.textContent = 'Reset password';
      if (subtitle) subtitle.textContent = `Create a new password for ${user.name}.`;
      const pass = SC.$('#staff-new-password');
      const confirm = SC.$('#staff-new-password-confirm');
      if (pass) pass.value = '';
      if (confirm) confirm.value = '';
      setPanel('password');
      setFooter('<button type="submit" class="btn btn-primary" form="staff-panel-password">Update password</button>');
    } else {
      const badges = SC.$('#staff-profile-badges');
      if (badges) {
        badges.hidden = true;
        badges.innerHTML = '';
      }
      const mine = String(user.id) === String(currentUserId());
      if (title) title.textContent = 'Account access';
      if (subtitle) subtitle.textContent = `Deactivate or remove ${user.name}.`;
      const copy = SC.$('#staff-access-copy');
      const warn = SC.$('#staff-access-warning');
      if (copy) {
        copy.textContent = isActive(user)
          ? 'Deactivate keeps the record but blocks sign-in. Delete removes the account from the directory.'
          : 'This account is inactive. Reactivate to restore sign-in, or delete it from the directory.';
      }
      if (warn) {
        warn.hidden = !mine;
        warn.textContent = mine ? 'You cannot delete your own account.' : '';
      }
      setPanel('access');
      const activate = isActive(user)
        ? '<button type="button" class="btn btn-secondary" data-staff-commit="deactivate">Deactivate</button>'
        : '<button type="button" class="btn btn-secondary" data-staff-commit="activate">Reactivate</button>';
      const remove = mine
        ? ''
        : '<button type="button" class="btn btn-danger" data-staff-commit="delete">Delete user</button>';
      setFooter(`${activate}${remove}`);
    }

    openModal('modal-staff');
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
    return `${out}a1`;
  }

  const CREATE_FIELD_IDS = {
    name: 'staff-create-name',
    email: 'staff-create-email',
    username: 'staff-create-username',
    role: 'staff-create-role',
    password: 'staff-create-password',
    password_confirmation: 'staff-create-password-confirm',
  };

  function clearCreateFieldErrors() {
    Object.values(CREATE_FIELD_IDS).forEach((id) => {
      const el = SC.$(`#${id}`);
      if (!el) return;
      el.classList.remove('is-invalid');
      el.removeAttribute('aria-invalid');
    });
    SC.$$('#staff-panel-create .field-error').forEach((err) => {
      err.hidden = true;
      err.textContent = '';
    });
  }

  function setCreateFieldError(field, message) {
    const id = CREATE_FIELD_IDS[field];
    const el = id ? SC.$(`#${id}`) : null;
    const err = SC.$(`#staff-error-${field}`);
    if (el) {
      el.classList.add('is-invalid');
      el.setAttribute('aria-invalid', 'true');
    }
    if (err) {
      err.textContent = message;
      err.hidden = false;
    }
  }

  function sanitizeUsername(raw) {
    let value = String(raw || '').trim();
    if (value.includes('@')) value = value.split('@')[0];
    value = value.replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '');
    return value.slice(0, 50);
  }

  function suggestUsernameFromEmail() {
    const usernameEl = SC.$('#staff-create-username');
    const emailEl = SC.$('#staff-create-email');
    if (!usernameEl || !emailEl) return;
    if (usernameEl.value.trim()) return;
    const suggested = sanitizeUsername(emailEl.value);
    if (suggested.length >= 3) usernameEl.value = suggested;
  }

  function errorMessage(err) {
    const errors = err?.data?.errors;
    if (errors && typeof errors === 'object') {
      return Object.values(errors).flat().filter(Boolean).join(' ');
    }
    const message = err?.message || 'Request failed.';
    if (err?.status === 500 || /server error/i.test(message)) {
      return 'The server could not save this account. Check that the email and username are unique, the password has at least one letter and one number, and try again.';
    }
    return message;
  }

  function applyServerCreateErrors(err) {
    const errors = err?.data?.errors;
    if (!errors || typeof errors !== 'object') return false;
    let applied = false;
    Object.entries(errors).forEach(([field, messages]) => {
      const msg = Array.isArray(messages) ? messages[0] : messages;
      if (!msg || !CREATE_FIELD_IDS[field]) return;
      setCreateFieldError(field, msg);
      applied = true;
    });
    return applied;
  }

  /** @returns {{ ok: boolean, payload?: object, firstInvalid?: string }} */
  function validateCreateForm() {
    clearCreateFieldErrors();
    suggestUsernameFromEmail();
    const usernameEl = SC.$('#staff-create-username');
    if (usernameEl) usernameEl.value = sanitizeUsername(usernameEl.value);

    const payload = {
      name: SC.$('#staff-create-name')?.value?.trim() || '',
      email: SC.$('#staff-create-email')?.value?.trim() || '',
      username: sanitizeUsername(SC.$('#staff-create-username')?.value || ''),
      password: SC.$('#staff-create-password')?.value || '',
      password_confirmation: SC.$('#staff-create-password-confirm')?.value || '',
      role: SC.$('#staff-create-role')?.value || '',
    };

    const checks = [
      ['name', !payload.name, 'Full name is required.'],
      ['email', !payload.email, 'Email is required.'],
      ['email', payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email), 'Enter a valid email address.'],
      ['username', !payload.username, 'Username is required.'],
      ['username', payload.username && payload.username.length < 3, 'Username must be at least 3 characters.'],
      [
        'username',
        payload.username && !/^[A-Za-z0-9._-]+$/.test(payload.username),
        'Username may only contain letters, numbers, dots, hyphens, and underscores (no spaces or @).',
      ],
      ['role', !payload.role, 'Choose a role.'],
      ['password', !payload.password, 'Password is required.'],
      ['password', payload.password && payload.password.length < 8, 'Password must be at least 8 characters.'],
      [
        'password',
        payload.password && (!/[A-Za-z]/.test(payload.password) || !/\d/.test(payload.password)),
        'Password must include at least one letter and one number.',
      ],
      [
        'password_confirmation',
        payload.password && payload.password !== payload.password_confirmation,
        'Passwords do not match.',
      ],
    ];

    let firstInvalid = null;
    const seen = new Set();
    checks.forEach(([field, failed, message]) => {
      if (!failed || seen.has(field)) return;
      seen.add(field);
      setCreateFieldError(field, message);
      if (!firstInvalid) firstInvalid = field;
    });

    if (firstInvalid) {
      return { ok: false, firstInvalid };
    }
    return { ok: true, payload };
  }

  async function saveCreate(e) {
    e.preventDefault();
    const alertEl = SC.$('#staff-modal-alert');
    hideAlert(alertEl);

    const result = validateCreateForm();
    if (!result.ok) {
      showAlert(alertEl, 'Fix the highlighted fields before creating the account.', 'error');
      const focusId = CREATE_FIELD_IDS[result.firstInvalid];
      SC.$(`#${focusId}`)?.focus();
      return;
    }

    try {
      await SC.withBusy({ button: e.submitter, busyLabel: 'Creating…' }, async () => {
        const created = await SmartCareAPI.post('/users', result.payload);
        clearCreateFieldErrors();
        closeModal('modal-staff');
        await loadStaff({ force: true });
        if (created.mail_sent) {
          window.alert(created.message || `Account created. Verification email sent to ${created.email}.`);
        } else if (created.verification_url) {
          window.alert(
            'Account created, but the verification email could not be delivered. Copy the link in the next dialog and share it with the user.',
          );
          window.prompt(
            created.message || 'Email delivery failed. Copy this verification link for the user:',
            created.verification_url,
          );
        } else {
          window.alert(
            created.message || 'Account created, but the verification email could not be sent. Ask them to use Resend verification or contact support.',
          );
        }
      });
    } catch (err) {
      clearCreateFieldErrors();
      const mapped = applyServerCreateErrors(err);
      showAlert(
        alertEl,
        mapped ? 'Fix the highlighted fields before creating the account.' : errorMessage(err),
        'error',
      );
      if (mapped) {
        const first = Object.keys(err?.data?.errors || {}).find((k) => CREATE_FIELD_IDS[k]);
        if (first) SC.$(`#${CREATE_FIELD_IDS[first]}`)?.focus();
      }
    }
  }

  async function saveRole(e) {
    e.preventDefault();
    const user = findUser(activeUserId);
    const alertEl = SC.$('#staff-modal-alert');
    const role = SC.$('#staff-role-select')?.value;
    if (!user || !role) return;
    try {
      await SC.withBusy({ button: e.submitter, busyLabel: 'Saving…' }, async () => {
        await SmartCareAPI.put(`/users/${user.id}`, { role });
        closeModal('modal-staff');
        await loadStaff({ force: true });
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    const user = findUser(activeUserId);
    const alertEl = SC.$('#staff-modal-alert');
    const password = SC.$('#staff-new-password')?.value || '';
    const confirm = SC.$('#staff-new-password-confirm')?.value || '';
    if (!user) return;
    if (password !== confirm) {
      showAlert(alertEl, 'Passwords do not match.', 'error');
      return;
    }
    try {
      await SC.withBusy({ button: e.submitter, busyLabel: 'Updating…' }, async () => {
        await SmartCareAPI.post(`/users/${user.id}/reset-password`, {
          password,
          password_confirmation: confirm,
        });
        closeModal('modal-staff');
        await loadStaff({ force: true });
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function commitAccess(kind, button) {
    const user = findUser(activeUserId);
    const alertEl = SC.$('#staff-modal-alert');
    if (!user) return;
    try {
      if (kind === 'delete') {
        const ok = window.confirm(`Permanently delete ${user.name}? This frees the email for re-registration and cannot be undone.`);
        if (!ok) return;
      }
      const busyLabel = kind === 'delete' ? 'Deleting…'
        : kind === 'resend-verification' ? 'Sending…'
        : kind === 'deactivate' ? 'Deactivating…'
        : 'Activating…';
      await SC.withBusy({ button, busyLabel }, async () => {
        if (kind === 'delete') {
          await SmartCareAPI.delete(`/users/${user.id}`);
        } else if (kind === 'resend-verification') {
          const result = await SmartCareAPI.post(`/users/${user.id}/resend-verification`);
          if (result.mail_sent) {
            showAlert(
              alertEl,
              result.message || `Verification email resent to ${user.email}.`,
              'success',
            );
          } else if (result.verification_url) {
            window.prompt(
              result.message || 'Email delivery failed. Copy this verification link for the user:',
              result.verification_url,
            );
            showAlert(alertEl, 'Email send failed — share the verification link instead.', 'error');
          } else {
            showAlert(alertEl, result.message || 'Could not resend verification email.', 'error');
          }
          return;
        } else if (kind === 'deactivate') {
          await SmartCareAPI.patch(`/users/${user.id}/deactivate`);
        } else if (kind === 'activate') {
          await SmartCareAPI.put(`/users/${user.id}`, { status: 'active' });
        }
        closeModal('modal-staff');
        await loadStaff({ force: true });
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function loadStaff() {
    const loading = SC.$('#staff-loading');
    const empty = SC.$('#staff-empty');
    const wrap = SC.$('#staff-table-wrap');
    if (!loading) return;

    if (!isHeadDoctor()) {
      loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.querySelector('h3').textContent = 'Restricted';
        empty.querySelector('p').textContent = 'Only Head Doctors can manage staff users.';
      }
      if (wrap) wrap.hidden = true;
      const activityPanel = SC.$('#staff-activity-panel');
      if (activityPanel) activityPanel.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (wrap) wrap.hidden = true;
    const activityPanel = SC.$('#staff-activity-panel');
    if (activityPanel) activityPanel.hidden = true;

    try {
      await SC.withBusy({ section: loading }, async () => {
        const payload = await SmartCareAPI.get('/users');
        const users = Array.isArray(payload) ? payload : payload.users || payload.data || [];
        staffCache = users;
        SC.state.usersCache = users;
        analyticsCache = Array.isArray(payload) ? null : payload.analytics || null;
        activityCache = Array.isArray(payload) ? [] : payload.activity || [];
        loading.hidden = true;
        renderAnalytics();
        renderDirectory();
      });
    } catch (err) {
      loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.querySelector('h3').textContent = 'Unable to load staff';
        empty.querySelector('p').textContent = err.message || 'Request failed.';
      }
    }
  }

  function initStaff() {
    SC.$('#staff-create-btn')?.addEventListener('click', () => openStaffModal('create'));
    const resetStaffPage = () => {
      staffPage = 1;
      renderDirectory();
    };
    SC.$('#staff-search')?.addEventListener('input', resetStaffPage);
    SC.$('#staff-role-filter')?.addEventListener('change', resetStaffPage);
    SC.$('#staff-status-filter')?.addEventListener('change', resetStaffPage);
    SC.bindPaginationControls({
      prevId: '#staff-page-prev',
      nextId: '#staff-page-next',
      getPage: () => staffPage,
      setPage: (page) => {
        staffPage = page;
      },
      getTotalPages: () => SC.paginate(filteredStaff(), staffPage, STAFF_PAGE_SIZE).totalPages,
      onChange: renderDirectory,
    });
    SC.$('#staff-table-wrap')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-staff-action]');
      if (!btn) return;
      openStaffModal(btn.dataset.staffAction, btn.dataset.userId);
    });
    document.addEventListener('click', (e) => {
      const assignBtn = e.target.closest('[data-staff-assign]');
      if (!assignBtn) return;
      const userId = assignBtn.getAttribute('data-staff-assign');
      const role = assignBtn.getAttribute('data-staff-assign-role') || '';
      closeModal('modal-staff');
      if (typeof SC.openAssignModal === 'function') SC.openAssignModal(userId, role);
    });
    SC.$('#staff-panel-create')?.addEventListener('submit', saveCreate);
    SC.$('#staff-panel-role')?.addEventListener('submit', saveRole);
    SC.$('#staff-panel-password')?.addEventListener('submit', savePassword);
    SC.$('#staff-create-email')?.addEventListener('blur', suggestUsernameFromEmail);
    SC.$('#staff-create-username')?.addEventListener('blur', () => {
      const el = SC.$('#staff-create-username');
      if (el) el.value = sanitizeUsername(el.value);
    });
    SC.$('#staff-panel-create')?.addEventListener('input', (e) => {
      const field = e.target?.closest?.('[data-staff-field]');
      if (!field) return;
      field.classList.remove('is-invalid');
      field.removeAttribute('aria-invalid');
      const key = field.getAttribute('data-staff-field');
      const err = SC.$(`#staff-error-${key}`);
      if (err) {
        err.hidden = true;
        err.textContent = '';
      }
      hideAlert(SC.$('#staff-modal-alert'));
    });
    SC.$('#staff-panel-create')?.addEventListener('change', (e) => {
      const field = e.target?.closest?.('[data-staff-field]');
      if (!field) return;
      field.classList.remove('is-invalid');
      field.removeAttribute('aria-invalid');
      const key = field.getAttribute('data-staff-field');
      const err = SC.$(`#staff-error-${key}`);
      if (err) {
        err.hidden = true;
        err.textContent = '';
      }
    });
    SC.$('#staff-create-generate-password')?.addEventListener('click', () => {
      const value = generatePassword();
      const pass = SC.$('#staff-create-password');
      const confirm = SC.$('#staff-create-password-confirm');
      if (pass) pass.value = value;
      if (confirm) confirm.value = value;
      clearCreateFieldErrors();
      hideAlert(SC.$('#staff-modal-alert'));
    });
    SC.$('#staff-generate-password')?.addEventListener('click', () => {
      const value = generatePassword();
      const pass = SC.$('#staff-new-password');
      const confirm = SC.$('#staff-new-password-confirm');
      if (pass) pass.value = value;
      if (confirm) confirm.value = value;
    });
    SC.$('#staff-modal-actions')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-staff-commit]');
      if (!btn) return;
      commitAccess(btn.dataset.staffCommit, btn);
    });
  }

  SC.loadStaff = loadStaff;
  SC.initStaff = initStaff;
  SC.openStaffModal = openStaffModal;
})(window.SmartCareApp);
