/** SmartCare dashboard — medication schedules */
(function (SC) {
  const isHeadDoctor = SC.isHeadDoctor;
  const childName = SC.childName;
  const initialsFromName = SC.initialsFromName;
  const openModal = SC.openModal;
  const closeModal = SC.closeModal;
  const escapeHtml = SC.escapeHtml;
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;
  const formatSessionTime = (...args) => SC.formatSessionTime(...args);

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOSE_LABELS = {
    1: ['Time'],
    2: ['Morning', 'Evening'],
    3: ['Morning', 'Afternoon', 'Evening'],
    4: ['Morning', 'Noon', 'Afternoon', 'Evening'],
  };
  const DOSE_DEFAULTS = {
    1: ['08:00'],
    2: ['08:00', '20:00'],
    3: ['08:00', '14:00', '20:00'],
    4: ['08:00', '12:00', '16:00', '20:00'],
  };
  const ICONS = {
    form: 'https://api.iconify.design/lucide/pill.svg?color=%230F3D30',
    view: 'https://api.iconify.design/lucide/clipboard-list.svg?color=%230F3D30',
    access: 'https://api.iconify.design/lucide/ban.svg?color=%23B42318',
  };

  let scheduleCache = [];
  let activeScheduleId = null;
  let medicationPage = 1;
  const MEDICATION_PAGE_SIZE = 10;
  const CHILD_SCHEDULE_PAGE_SIZE = 6;
  const openMedicationGroups = new Set();
  const childSchedulePages = new Map();

  function getChildSchedulePage(childId) {
    const page = Number(childSchedulePages.get(String(childId)) || 1);
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  function setChildSchedulePage(childId, page) {
    childSchedulePages.set(String(childId), Math.max(1, Number(page) || 1));
  }

  function isActive(schedule) {
    return schedule?.is_active !== false;
  }

  function findSchedule(id) {
    return scheduleCache.find((s) => String(s.id) === String(id));
  }

  function daysOf(schedule) {
    const days = schedule?.days_of_week;
    return Array.isArray(days) ? days.map(Number) : [];
  }

  function formatDays(days) {
    if (!days.length || days.length === 7) return days.length === 7 ? 'Every day' : '—';
    return days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAY_LABELS[d] || d)
      .join(', ');
  }

  function formatTime(value) {
    if (!value) return '—';
    const raw = String(value).slice(0, 5);
    const [h, m] = raw.split(':').map(Number);
    if (Number.isNaN(h)) return raw;
    const date = new Date();
    date.setHours(h, m || 0, 0, 0);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function toTimeInput(value) {
    if (!value) return '';
    return String(value).slice(0, 5);
  }

  function timesOf(schedule) {
    const listed = schedule?.times_of_day;
    if (Array.isArray(listed) && listed.length) return listed.map(toTimeInput).filter(Boolean);
    if (schedule?.time_of_day) return [toTimeInput(schedule.time_of_day)];
    return [];
  }

  function formatTimes(schedule) {
    const times = timesOf(schedule);
    if (!times.length) return '—';
    return times.map(formatTime).join(', ');
  }

  function doseLabel(count) {
    if (count <= 1) return 'Once daily';
    if (count === 2) return 'Twice daily';
    return `${count} times daily`;
  }

  function renderTimeFields(times) {
    const wrap = SC.$('#medication-times');
    if (!wrap) return;
    const count = Math.min(4, Math.max(1, times.length || 1));
    const values = DOSE_DEFAULTS[count].map((fallback, i) => times[i] || fallback);
    const labels = DOSE_LABELS[count];
    wrap.dataset.count = String(count);
    wrap.innerHTML = values
      .map(
        (value, index) => `
        <div class="form-group">
          <label for="medication-time-${index}">${escapeHtml(labels[index] || `Dose ${index + 1}`)}</label>
          <input type="time" id="medication-time-${index}" class="field-control medication-time-input" value="${escapeHtml(value)}" required>
        </div>`
      )
      .join('');
    SC.$$('#medication-doses [data-doses]').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.doses) === count);
    });
  }

  function selectedTimes() {
    return [...SC.$$('.medication-time-input')]
      .map((el) => toTimeInput(el.value))
      .filter(Boolean);
  }

  function errorMessage(err) {
    const errors = err?.data?.errors;
    if (errors && typeof errors === 'object') return Object.values(errors).flat().join(' ');
    return err.message || 'Request failed.';
  }

  function setPanel(name) {
    SC.$$('.medication-modal-panel').forEach((panel) => {
      panel.hidden = panel.id !== `medication-panel-${name}`;
    });
  }

  function setFooter(html) {
    const actions = SC.$('#medication-modal-actions');
    if (actions) actions.innerHTML = html;
  }

  function setMedicationFace(action, schedule) {
    const avatar = SC.$('#modal-medication-avatar');
    const iconWrap = SC.$('#modal-medication-icon-wrap');
    const icon = SC.$('#modal-medication-icon');
    const showAvatar = action === 'view' && schedule;
    if (avatar) {
      avatar.hidden = !showAvatar;
      if (showAvatar) {
        avatar.textContent = initialsFromName(schedule.child ? childName(schedule.child) : schedule.medicine_name || 'Med');
      }
    }
    if (iconWrap) iconWrap.hidden = showAvatar;
    if (icon && !showAvatar) icon.src = ICONS[action] || ICONS.form;
  }

  function selectedDays() {
    return [...SC.$$('#medication-days input:checked')].map((el) => Number(el.value));
  }

  function setDays(days) {
    const values = Array.isArray(days) && days.length ? days.map(String) : ['0', '1', '2', '3', '4', '5', '6'];
    SC.$$('#medication-days input').forEach((el) => {
      el.checked = values.includes(el.value);
    });
  }

  function populateLookups(selectedChild) {
    const options = (SC.state.childrenCache || [])
      .map((c) => `<option value="${c.id}">${escapeHtml(childName(c))}</option>`)
      .join('');
    const filter = SC.$('#medication-filter-child');
    const child = SC.$('#medication-child');
    if (filter) {
      const current = selectedChild !== undefined ? selectedChild : filter.value;
      filter.innerHTML = `<option value="">All children</option>${options}`;
      if (current) filter.value = String(current);
    }
    if (child) {
      const current = child.value;
      child.innerHTML = `<option value="">Select a child…</option>${options}`;
      if (current) child.value = current;
    }
  }

  function filteredSchedules() {
    const query = (SC.$('#medication-search')?.value || '').trim().toLowerCase();
    const childId = SC.$('#medication-filter-child')?.value || '';
    const status = SC.$('#medication-filter-status')?.value || '';
    return scheduleCache.filter((s) => {
      if (childId && String(s.child_id) !== String(childId) && String(s.child?.id) !== String(childId)) return false;
      if (status === 'active' && !isActive(s)) return false;
      if (status === 'inactive' && isActive(s)) return false;
      if (query) {
        const hay = `${s.child ? childName(s.child) : ''} ${s.medicine_name || ''} ${s.dosage || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  function renderSummary() {
    const hint = SC.$('#medication-summary-line');
    const chip = SC.$('#medication-toolbar-count');
    const active = scheduleCache.filter(isActive).length;
    const inactive = scheduleCache.length - active;
    if (hint) {
      hint.textContent = `Grouped by child (A–Z) · ${active} active · ${inactive} inactive`;
    }
    if (chip) chip.textContent = String(filteredSchedules().length);
  }

  function groupSchedulesByChild(schedules) {
    const groups = new Map();
    (schedules || []).forEach((s) => {
      const child = s.child || {};
      const childId = String(s.child_id || child.id || 'unknown');
      if (!groups.has(childId)) {
        groups.set(childId, { childId, child, schedules: [] });
      }
      const group = groups.get(childId);
      if (!group.child?.id && child.id) group.child = child;
      group.schedules.push(s);
    });
    return [...groups.values()]
      .map((group) => {
        group.schedules.sort((a, b) =>
          String(a.medicine_name || '').localeCompare(String(b.medicine_name || ''), undefined, {
            sensitivity: 'base',
          })
        );
        return group;
      })
      .sort((a, b) => childName(a.child).localeCompare(childName(b.child), undefined, { sensitivity: 'base' }));
  }

  function renderScheduleRow(s) {
    const active = isActive(s);
    return `
      <tr class="${active ? '' : 'is-inactive'}" data-schedule-id="${s.id}">
        <td>
          <strong>${escapeHtml(s.medicine_name || '—')}</strong>
          <small class="staff-table__muted" style="display:block">${escapeHtml(s.dosage || 'No dosage')}</small>
        </td>
        <td>
          <strong>${escapeHtml(formatTimes(s))}</strong>
          <small class="staff-table__muted" style="display:block">${escapeHtml(doseLabel(timesOf(s).length))}</small>
        </td>
        <td>${escapeHtml(formatDays(daysOf(s)))}</td>
        <td><span class="badge-status ${active ? '' : 'badge-status--inactive'}">${active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div class="row-actions">
            <button type="button" class="icon-btn icon-btn--sm" data-med-action="view" data-schedule-id="${s.id}" title="View details" aria-label="View schedule">
              ${SC.icon('eye', { size: 16 })}
            </button>
            <button type="button" class="icon-btn icon-btn--sm" data-med-action="edit" data-schedule-id="${s.id}" title="Edit schedule" aria-label="Edit schedule">
              ${SC.icon('pencil', { size: 16 })}
            </button>
            <button type="button" class="icon-btn icon-btn--sm" data-med-action="access" data-schedule-id="${s.id}" title="${active ? 'Deactivate' : 'Reactivate'}" aria-label="${active ? 'Deactivate schedule' : 'Reactivate schedule'}">
              ${SC.icon(active ? 'ban' : 'rotate-ccw', { size: 16 })}
            </button>
          </div>
        </td>
      </tr>`;
  }

  function renderMedicationGroup(group) {
    const child = group.child || {};
    const name = childName(child) || 'Unknown child';
    const initials = initialsFromName(name);
    const count = group.schedules.length;
    const activeCount = group.schedules.filter(isActive).length;
    const isOpen = openMedicationGroups.has(group.childId);
    const totalPages = Math.max(1, Math.ceil(count / CHILD_SCHEDULE_PAGE_SIZE) || 1);
    let page = getChildSchedulePage(group.childId);
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    setChildSchedulePage(group.childId, page);
    const start = (page - 1) * CHILD_SCHEDULE_PAGE_SIZE;
    const pageItems = group.schedules.slice(start, start + CHILD_SCHEDULE_PAGE_SIZE);
    const showingFrom = count ? start + 1 : 0;
    const showingTo = Math.min(start + CHILD_SCHEDULE_PAGE_SIZE, count);

    return `
      <details class="assessment-group medication-group" data-child-group="${escapeHtml(group.childId)}"${isOpen ? ' open' : ''}>
        <summary class="assessment-group__summary">
          <span class="assessment-card__avatar" aria-hidden="true">${escapeHtml(initials)}</span>
          <div class="assessment-group__identity">
            <h4 class="assessment-group__title">${escapeHtml(name)}</h4>
            <p class="assessment-group__meta">
              ${count} schedule${count === 1 ? '' : 's'}
              · ${activeCount} active
            </p>
          </div>
          <div class="assessment-group__aside">
            <span class="count-chip">${count}</span>
            <span class="assessment-group__chevron" aria-hidden="true"></span>
          </div>
        </summary>
        <div class="assessment-group__body">
          <div class="data-table-wrap staff-table-wrap medication-group__table">
            <table class="staff-table" aria-label="Schedules for ${escapeHtml(name)}">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Time</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${pageItems.map(renderScheduleRow).join('')}
              </tbody>
            </table>
          </div>
          ${
            totalPages > 1
              ? `<nav class="assessment-group__pagination" aria-label="Schedules for ${escapeHtml(name)}">
                  <button type="button" class="btn btn-secondary btn-sm" data-med-child-page="prev" data-child-id="${escapeHtml(group.childId)}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
                  <p class="assessment-group__page-meta">Page ${page} of ${totalPages} · Showing ${showingFrom}–${showingTo} of ${count}</p>
                  <button type="button" class="btn btn-secondary btn-sm" data-med-child-page="next" data-child-id="${escapeHtml(group.childId)}" ${page >= totalPages ? 'disabled' : ''}>Next</button>
                </nav>`
              : ''
          }
        </div>
      </details>`;
  }

  function renderSchedules({ scrollToTop = false } = {}) {
    const list = SC.$('#medication-groups');
    const empty = SC.$('#medication-empty');
    const pagination = SC.$('#medication-pagination');
    if (!list || !empty) return;
    const rows = filteredSchedules();
    const groups = groupSchedulesByChild(rows);
    const pageData = SC.paginate(groups, medicationPage, MEDICATION_PAGE_SIZE);
    medicationPage = pageData.page;
    renderSummary();
    const emptyBtn = SC.$('#empty-open-medication');
    if (!rows.length) {
      list.hidden = true;
      list.innerHTML = '';
      empty.hidden = false;
      if (pagination) pagination.hidden = true;
      empty.querySelector('h3').textContent = scheduleCache.length ? 'No matching schedules' : 'No schedules yet';
      empty.querySelector('p').textContent = scheduleCache.length
        ? 'Try another search or filter.'
        : 'Add a plan so caretakers can see today’s doses on mobile.';
      if (emptyBtn) emptyBtn.hidden = scheduleCache.length > 0;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = pageData.items.map(renderMedicationGroup).join('');

    SC.renderPaginationControls({
      nav: pagination,
      prev: SC.$('#medication-page-prev'),
      next: SC.$('#medication-page-next'),
      meta: SC.$('#medication-page-meta'),
      page: pageData.page,
      totalPages: pageData.totalPages,
      from: pageData.from,
      to: pageData.to,
      total: pageData.total,
    });

    const meta = SC.$('#medication-page-meta');
    if (meta && pageData.total) {
      meta.textContent = `Page ${pageData.page} of ${pageData.totalPages} · ${pageData.from}–${pageData.to} of ${pageData.total} children · ${rows.length} schedules`;
    }

    if (scrollToTop) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function fillDetails(schedule) {
    const hero = SC.$('#medication-view-hero');
    const list = SC.$('#medication-detail-list');
    const notes = SC.$('#medication-view-notes');
    const logsList = SC.$('#medication-logs-list');
    const logsEmpty = SC.$('#medication-logs-empty');
    const active = isActive(schedule);
    if (hero) {
      hero.innerHTML = `
        <div class="therapy-hero__when">
          <strong>${escapeHtml(schedule.medicine_name || 'Medicine')}</strong>
          <span>${escapeHtml(formatTimes(schedule))}</span>
        </div>
        <div class="therapy-hero__meta">
          <span class="badge-status ${active ? '' : 'badge-status--inactive'}">${active ? 'Active' : 'Inactive'}</span>
          <span class="therapy-hero__dur">${escapeHtml(formatDays(daysOf(schedule)))}</span>
        </div>`;
    }
    if (list) {
      const facts = [
        ['Child', schedule.child ? childName(schedule.child) : '—'],
        ['Dosage', schedule.dosage || 'Not recorded'],
        ['Times', formatTimes(schedule)],
        ['Frequency', doseLabel(timesOf(schedule).length)],
        ['Days', formatDays(daysOf(schedule))],
        ['Created by', schedule.creator?.name || schedule.creator?.username || '—'],
      ];
      list.innerHTML = facts
        .map(
          ([label, value]) => `
          <div class="staff-fact-cell">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>`
        )
        .join('');
    }
    if (notes) {
      notes.innerHTML = `
        <article class="therapy-note">
          <span>Instructions</span>
          <p class="${schedule.instructions ? '' : 'is-empty'}">${escapeHtml(schedule.instructions || 'No special instructions')}</p>
        </article>`;
    }
    if (logsList) logsList.innerHTML = '';
    if (logsEmpty) logsEmpty.hidden = true;
    const childId = schedule.child_id || schedule.child?.id;
    if (!childId) return;
    try {
      const rows = await SmartCareAPI.get(`/children/${childId}/medication-logs`);
      const logs = (Array.isArray(rows) ? rows : rows.data || []).filter(
        (log) => String(log.medication_schedule_id) === String(schedule.id)
      );
      if (!logs.length) {
        if (logsEmpty) logsEmpty.hidden = false;
        return;
      }
      logsList.innerHTML = logs
        .slice(0, 8)
        .map((log) => {
          const status = String(log.status || 'given').replace(/_/g, ' ');
          const who = log.caretaker?.name || log.caretaker?.username || 'Caretaker';
          return `
            <div class="therapy-slot">
              <span class="badge-status ${log.status === 'given' ? '' : 'badge-status--inactive'}">${escapeHtml(status)}</span>
              <span class="therapy-slot__when">
                <strong>${escapeHtml(formatSessionTime(log.administered_at))}</strong>
                <small>${escapeHtml(who)}</small>
              </span>
              <span class="therapy-slot__dur">${escapeHtml(log.notes || '')}</span>
            </div>`;
        })
        .join('');
    } catch {
      if (logsEmpty) {
        logsEmpty.hidden = false;
        logsEmpty.textContent = 'Could not load administration logs.';
      }
    }
  }

  async function openMedicationModal(action, scheduleId) {
    const alertEl = SC.$('#medication-modal-alert');
    hideAlert(alertEl);
    const title = SC.$('#modal-medication-title');
    const subtitle = SC.$('#modal-medication-subtitle');
    const dismiss = SC.$('#medication-modal-dismiss');
    const schedule = scheduleId ? findSchedule(scheduleId) : null;
    activeScheduleId = schedule?.id || null;
    const modal = SC.$('#modal-medication');
    if (modal) modal.dataset.medicationMode = action;
    setMedicationFace(action, schedule);
    if (dismiss) dismiss.textContent = action === 'view' ? 'Close' : 'Cancel';

    if (action === 'form' || action === 'edit') {
      populateLookups(SC.$('#medication-filter-child')?.value);
      SC.$('#medication-schedule-id').value = schedule?.id || '';
      SC.$('#medication-child').value = schedule?.child_id || schedule?.child?.id || '';
      SC.$('#medication-child').disabled = Boolean(schedule);
      SC.$('#medication-name').value = schedule?.medicine_name || '';
      SC.$('#medication-dosage').value = schedule?.dosage || '';
      SC.$('#medication-instructions').value = schedule?.instructions || '';
      renderTimeFields(timesOf(schedule));
      setDays(daysOf(schedule));
      if (title) title.textContent = schedule ? 'Edit schedule' : 'Add schedule';
      if (subtitle) {
        subtitle.textContent = schedule
          ? 'Update medicine, timing, or instructions.'
          : 'Create a medication plan caretakers administer.';
      }
      setPanel('form');
      setFooter(`<button type="submit" class="btn btn-primary" form="medication-panel-form">${schedule ? 'Save changes' : 'Save schedule'}</button>`);
    } else if (action === 'view' && schedule) {
      if (title) title.textContent = schedule.medicine_name || 'Schedule details';
      if (subtitle) subtitle.textContent = `${schedule.child ? childName(schedule.child) : 'Child'} · ${isActive(schedule) ? 'Active' : 'Inactive'}`;
      setPanel('view');
      setFooter('');
      await fillDetails(schedule);
    } else if (action === 'access' && schedule) {
      const active = isActive(schedule);
      if (title) title.textContent = active ? 'Deactivate schedule' : 'Reactivate schedule';
      if (subtitle) subtitle.textContent = schedule.medicine_name || '';
      const copy = SC.$('#medication-access-copy');
      const hint = SC.$('#medication-access-hint');
      if (copy) {
        copy.textContent = active
          ? `Deactivate ${schedule.medicine_name || 'this plan'} for ${schedule.child ? childName(schedule.child) : 'this child'}?`
          : `Reactivate ${schedule.medicine_name || 'this plan'} for ${schedule.child ? childName(schedule.child) : 'this child'}?`;
      }
      if (hint) {
        hint.textContent = active
          ? 'Caretakers will no longer see it in today’s doses.'
          : 'Caretakers will see this plan again in today’s doses.';
      }
      setPanel('access');
      setFooter(
        active
          ? '<button type="button" class="btn btn-danger" data-med-commit="deactivate">Deactivate</button>'
          : '<button type="button" class="btn btn-primary" data-med-commit="reactivate">Reactivate</button>'
      );
    }
    openModal('modal-medication');
  }

  async function saveSchedule(e) {
    e.preventDefault();
    const alertEl = SC.$('#medication-modal-alert');
    const id = SC.$('#medication-schedule-id')?.value;
    const days = selectedDays();
    const times = selectedTimes();
    if (!times.length) {
      showAlert(alertEl, 'Add at least one dose time.', 'error');
      return;
    }
    const payload = {
      medicine_name: SC.$('#medication-name').value.trim(),
      dosage: SC.$('#medication-dosage').value.trim() || null,
      instructions: SC.$('#medication-instructions').value.trim() || null,
      times_of_day: times,
      time_of_day: times[0] || null,
      days_of_week: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    };
    if (!id) payload.child_id = Number(SC.$('#medication-child').value);
    try {
      await SC.withBusy({ button: e.submitter, busyLabel: 'Saving…' }, async () => {
        if (id) await SmartCareAPI.put(`/medication-schedules/${id}`, payload);
        else await SmartCareAPI.post('/medication-schedules', payload);
        closeModal('modal-medication');
        await loadMedicationSchedules();
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function commitAccess(kind, button) {
    const schedule = findSchedule(activeScheduleId);
    const alertEl = SC.$('#medication-modal-alert');
    if (!schedule) return;
    try {
      await SC.withBusy({
        button,
        busyLabel: kind === 'deactivate' ? 'Deactivating…' : 'Reactivating…',
      }, async () => {
        await SmartCareAPI.put(`/medication-schedules/${schedule.id}`, {
          is_active: kind !== 'deactivate',
        });
        closeModal('modal-medication');
        await loadMedicationSchedules();
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function loadMedicationSchedules() {
    const loading = SC.$('#medication-loading');
    const empty = SC.$('#medication-empty');
    const list = SC.$('#medication-groups');
    if (!loading) return;
    if (!isHeadDoctor()) {
      loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.querySelector('h3').textContent = 'Restricted';
        empty.querySelector('p').textContent = 'Only Head Doctors can manage medication schedules on web.';
      }
      if (list) {
        list.hidden = true;
        list.innerHTML = '';
      }
      return;
    }

    if (empty) empty.hidden = true;
    if (list) list.hidden = true;

    try {
      await SC.withBusy({ section: loading }, async () => {
        if (!SC.state.childrenCache.length && SC.loadChildren) await SC.loadChildren();
        populateLookups(SC.$('#medication-filter-child')?.value);
        const rows = await SmartCareAPI.get('/medication-schedules');
        scheduleCache = Array.isArray(rows) ? rows : rows.data || [];
        childSchedulePages.clear();
        loading.hidden = true;
        renderSchedules();
      });
    } catch (err) {
      loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.querySelector('h3').textContent = 'Unable to load schedules';
        empty.querySelector('p').textContent = err.message || 'Request failed.';
      }
    }
  }

  function initMedication() {
    SC.$('#open-medication-schedule')?.addEventListener('click', () => openMedicationModal('form'));
    SC.$('#empty-open-medication')?.addEventListener('click', () => openMedicationModal('form'));
    const resetMedicationPage = () => {
      medicationPage = 1;
      childSchedulePages.clear();
      renderSchedules();
    };
    SC.$('#medication-search')?.addEventListener('input', resetMedicationPage);
    SC.$('#medication-filter-child')?.addEventListener('change', resetMedicationPage);
    SC.$('#medication-filter-status')?.addEventListener('change', resetMedicationPage);
    SC.bindPaginationControls({
      prevId: '#medication-page-prev',
      nextId: '#medication-page-next',
      getPage: () => medicationPage,
      setPage: (page) => {
        medicationPage = page;
      },
      getTotalPages: () =>
        SC.paginate(groupSchedulesByChild(filteredSchedules()), medicationPage, MEDICATION_PAGE_SIZE).totalPages,
      onChange: renderSchedules,
    });
    const list = SC.$('#medication-groups');
    list?.addEventListener('toggle', (e) => {
      const details = e.target.closest?.('details.medication-group');
      if (!details || e.target !== details) return;
      const childId = details.getAttribute('data-child-group');
      if (!childId) return;
      if (details.open) openMedicationGroups.add(childId);
      else openMedicationGroups.delete(childId);
    });
    list?.addEventListener('click', (e) => {
      const pageBtn = e.target.closest('[data-med-child-page]');
      if (pageBtn) {
        e.preventDefault();
        const childId = pageBtn.getAttribute('data-child-id');
        const direction = pageBtn.getAttribute('data-med-child-page');
        if (!childId || pageBtn.disabled) return;
        const group = groupSchedulesByChild(filteredSchedules()).find(
          (g) => String(g.childId) === String(childId)
        );
        const totalPages = Math.max(
          1,
          Math.ceil((group?.schedules.length || 0) / CHILD_SCHEDULE_PAGE_SIZE) || 1
        );
        let page = getChildSchedulePage(childId);
        if (direction === 'prev') page -= 1;
        if (direction === 'next') page += 1;
        page = Math.min(totalPages, Math.max(1, page));
        setChildSchedulePage(childId, page);
        openMedicationGroups.add(String(childId));
        renderSchedules();
        return;
      }
      const btn = e.target.closest('[data-med-action]');
      if (!btn) return;
      openMedicationModal(btn.dataset.medAction, btn.dataset.scheduleId);
    });
    SC.$('#medication-panel-form')?.addEventListener('submit', saveSchedule);
    SC.$('#medication-doses')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-doses]');
      if (!btn) return;
      const count = Number(btn.dataset.doses);
      const current = selectedTimes();
      renderTimeFields((DOSE_DEFAULTS[count] || DOSE_DEFAULTS[1]).map((fallback, i) => current[i] || fallback));
    });
    SC.$('#medication-modal-actions')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-med-commit]');
      if (!btn) return;
      commitAccess(btn.dataset.medCommit, btn);
    });
  }

  SC.loadMedicationSchedules = loadMedicationSchedules;
  SC.initMedication = initMedication;
  SC.openMedicationModal = openMedicationModal;
  SC.populateMedicationSelects = populateLookups;
})(window.SmartCareApp);
