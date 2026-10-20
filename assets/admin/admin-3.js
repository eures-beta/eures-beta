const state = {
      activeTab: "cockpit",
      cockpit: {
        data: null,
        loading: false,
      },
      tasks: {
        rows: [],
        loading: false,
      },
      invitations: {
        rows: [],
        loading: false,
        selectionMode: false,
        selectedIds: [],
        view: "dashboard",
      },
      candidateResponses: {
        rows: [],
        loading: false,
        signature: "",
        unseenCount: 0,
        initialized: false,
      },
      employerResponses: {
        rows: [],
        loading: false,
        signature: "",
        unseenCount: 0,
        initialized: false,
      },
      matchings: {
        rows: [],
        loading: false,
        view: "pending",
      },
      noMatch: {
        rows: [],
        loading: false,
      },
      newJobs: {
        rows: [],
        loading: false,
      },
      dataHistoryView: "home",
      dataHistorySearch: "",
      relationsView: "to-launch",
      relationsSearch: "",
      employers: {
        rows: [],
        loading: false,
        loaded: false,
      },
      brevo: null,
      taskMenuCounts: {
        tasks: 0,
        "matchings-pending": 0,
        "matchings-employer-responded": 0,
        "no-match": 0,
        "new-jobs": 0,
      },
      visitAnalytics: null,
      technicalView: "health",
      questionnaireAutoRefreshTimer: null,
    };

    const technicalViewByTarget = {
      "technical-health": "health",
      "technical-brevo": "brevo",
      "technical-email-tests": "email-tests",
      "technical-visit-analytics": "visit-analytics",
      "technical-grist": "grist",
      "technical-public-links": "public-links",
      "technical-candidate-flow": "candidate-flow",
      "technical-employer-flow": "employer-flow",
      "technical-matching-flow": "matching-flow",
      "technical-logs": "logs"
    };

    const technicalPlaceholderCopy = {
      grist: {
        title: "Diagnostic Grist",
        text: "Contrôles prévus : accès API, tables candidats/employeurs/invitations/matchings et dernière écriture connue."
      },
      "public-links": {
        title: "Diagnostic des liens publics",
        text: "Contrôles prévus : questionnaires candidat/employeur, notice de confidentialité, pages publiques Match Europe et cohérence des liens Brevo."
      },
      "candidate-flow": {
        title: "Test du parcours candidat",
        text: "Contrôles prévus : invitation, formulaire, consentement WhatsApp, enregistrement Grist, email candidat et visibilité admin."
      },
      "employer-flow": {
        title: "Test du parcours employeur",
        text: "Contrôles prévus : invitation, formulaire besoin employeur, accord WhatsApp par matching, téléphone confirmé et visibilité admin."
      },
      "matching-flow": {
        title: "Test du moteur de matching",
        text: "Contrôles prévus : calcul automatique, création manuelle, validation avec ou sans email, envoi employeur/candidat et traçabilité."
      },
      logs: {
        title: "Logs et erreurs",
        text: "Contrôles prévus : dernières erreurs d’envoi, erreurs d’API, actions admin sensibles et événements à investiguer."
      }
    };

    function esc(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function apiUrl(path) {
      return `/api/forms/eures-beta${path}`;
    }

    function setStatus(targetId, message) {
      document.getElementById(targetId).textContent = message;
    }

    function responseWatchLabel(count, singular, plural) {
      return `${count} ${count > 1 ? plural : singular}`;
    }

    function renderGlobalResponseWatch() {
      const candidateCount = Number(state.candidateResponses.unseenCount || 0);
      const employerCount = Number(state.employerResponses.unseenCount || 0);
      const total = candidateCount + employerCount;
      const panel = document.getElementById("global-response-watch");
      const text = document.getElementById("global-response-watch-text");
      const candidateButton = document.getElementById("global-watch-open-candidates");
      const employerButton = document.getElementById("global-watch-open-employers");
      if (!panel || !text || !candidateButton || !employerButton) return;

      if (!total) {
        panel.hidden = true;
        text.textContent = "";
        candidateButton.hidden = true;
        employerButton.hidden = true;
        if (state.cockpit.data) {
          renderCockpit();
        }
        return;
      }

      const parts = [];
      if (candidateCount) {
        parts.push(responseWatchLabel(candidateCount, "nouvelle réponse candidat", "nouvelles réponses candidats"));
      }
      if (employerCount) {
        parts.push(responseWatchLabel(employerCount, "nouvelle réponse employeur", "nouvelles réponses employeurs"));
      }
      panel.hidden = false;
      text.innerHTML = `<strong>Nouvelles réponses détectées :</strong> ${esc(parts.join(" · "))}`;
      candidateButton.hidden = candidateCount === 0;
      employerButton.hidden = employerCount === 0;
      if (state.cockpit.data) {
        renderCockpit();
      }
    }

    function setTaskMenuCount(key, value) {
      const count = Math.max(0, Number(value || 0));
      state.taskMenuCounts[key] = count;
      for (const badge of document.querySelectorAll(`[data-task-menu-badge="${key}"]`)) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.hidden = count === 0;
      }
    }

    function updateTaskMenuBadgesFromCockpit() {
      const priorities = state.cockpit.data?.priorities || {};
      const total =
        Number(priorities.matching_review || 0) +
        Number(priorities.employer_response || 0) +
        Number(priorities.no_match_followup || 0) +
        Number(priorities.new_job_request || 0) +
        Number(priorities.new_employer_alert || 0) +
        Number(priorities.duplicate_invitation_followup || 0);
      setTaskMenuCount("tasks", total);
      setTaskMenuCount("matchings-pending", priorities.matching_review || 0);
      setTaskMenuCount("matchings-employer-responded", priorities.employer_response || 0);
      setTaskMenuCount("no-match", priorities.no_match_followup || 0);
      setTaskMenuCount("new-jobs", priorities.new_job_request || 0);
    }

    function updateTaskMenuBadges() {
      for (const [key, count] of Object.entries(state.taskMenuCounts)) {
        setTaskMenuCount(key, count);
      }
    }

    function invitationViewTarget(target) {
      const map = {
        invitations: "dashboard",
        "invitations-dashboard": "dashboard",
        "invite-candidate": "single-candidate",
        "invite-employer": "single-employer",
        "invite-import": "import",
        "matchings-manual-builder": "manual-matching",
        "invite-reminders": "reminders",
        "invite-errors": "errors",
      };
      return map[target] || "";
    }

    function setInvitationView(view) {
      const normalizedView = [
        "dashboard",
        "single-candidate",
        "single-employer",
        "import",
        "manual-matching",
        "reminders",
        "errors",
      ].includes(view) ? view : "dashboard";
      state.invitations.view = normalizedView;

      const visibleSections = {
        dashboard: new Set(["dashboard", "send", "list"]),
        "single-candidate": new Set(["compose"]),
        "single-employer": new Set(["compose"]),
        import: new Set(["compose"]),
        "manual-matching": new Set(["manual-matching"]),
        reminders: new Set(["reminders", "list"]),
        errors: new Set(["list"]),
      }[normalizedView];

      for (const section of document.querySelectorAll("[data-invitation-section]")) {
        section.hidden = !visibleSections.has(section.dataset.invitationSection);
      }

      for (const panel of document.querySelectorAll("[data-invitation-compose]")) {
        const kind = panel.dataset.invitationCompose;
        panel.hidden = !(
          (kind === "single" && ["single-candidate", "single-employer"].includes(normalizedView)) ||
          (kind === "import" && normalizedView === "import")
        );
      }

      const roleSelect = document.getElementById("single-role");
      if (roleSelect && ["single-candidate", "single-employer"].includes(normalizedView)) {
        roleSelect.value = normalizedView === "single-employer" ? "employer" : "candidate";
        updateSingleInvitationRoleUI();
      }

      const statusSelect = document.getElementById("invite-filter-status");
      if (statusSelect) {
        if (normalizedView === "dashboard") statusSelect.value = "invitation_a_envoyer";
        if (normalizedView === "reminders") statusSelect.value = "reminder_due";
        if (normalizedView === "errors") statusSelect.value = "all";
      }

      const listCard = document.getElementById("invitation-list-card");
      const searchToolbar = document.getElementById("invitation-search-toolbar");
      if (listCard) {
        listCard.classList.toggle("compact", !["reminders", "errors"].includes(normalizedView));
      }
      if (searchToolbar) {
        searchToolbar.hidden = !["reminders", "errors"].includes(normalizedView);
      }
      const hiddenSearch = document.getElementById("invite-filter-search");
      const visibleSearch = document.getElementById("invite-visible-search");
      if (!["reminders", "errors"].includes(normalizedView)) {
        if (hiddenSearch) hiddenSearch.value = "";
        if (visibleSearch) visibleSearch.value = "";
      } else if (hiddenSearch && visibleSearch) {
        visibleSearch.value = hiddenSearch.value;
      }

      for (const button of document.querySelectorAll(".admin-side-nav button")) {
        const target = button.dataset.openList || "";
        const viewForTarget = invitationViewTarget(target);
        if (viewForTarget) {
          button.classList.toggle("active", viewForTarget === normalizedView);
        }
      }

      if (normalizedView === "manual-matching") {
        renderManualMatchingOptions();
        renderManualMatchingPreview();
        loadSpontaneousCandidates();
      }
    }

    function dataHistoryViewTarget(target) {
      const map = {
        "candidate-responses": "candidate-responses",
        "employer-responses": "employer-responses",
        matchings: "matchings",
        invitations: "invitations",
      };
      return map[target] || "";
    }

    function setDataHistoryView(view) {
      const normalizedView = ["home", "candidate-responses", "employer-responses", "matchings", "invitations"].includes(view)
        ? view
        : "home";
      state.dataHistoryView = normalizedView;
      for (const section of document.querySelectorAll("[data-history-section]")) {
        section.hidden = section.dataset.historySection !== normalizedView;
      }
      for (const button of document.querySelectorAll("[data-open-history]")) {
        button.classList.toggle("active", dataHistoryViewTarget(button.dataset.openHistory) === normalizedView);
      }
      const searchToolbar = document.getElementById("data-history-search-toolbar");
      if (searchToolbar) {
        searchToolbar.hidden = normalizedView === "home";
      }
      renderDataHistoryView();
    }

    async function openDataHistoryView(view) {
      const normalizedView = dataHistoryViewTarget(view) || "home";
      activateTab("data-history");
      setDataHistoryView(normalizedView);
      if (normalizedView === "candidate-responses") {
        await loadQuestionnaireResponses("candidate", { clearUnseen: true });
      }
      if (normalizedView === "employer-responses") {
        await loadQuestionnaireResponses("employer", { clearUnseen: true });
      }
      if (normalizedView === "matchings") {
        document.getElementById("filter-status").value = "all";
        document.getElementById("filter-source").value = "all";
        await loadMatchings();
      }
      if (normalizedView === "invitations") {
        document.getElementById("invite-filter-status").value = "all";
        await loadInvitations();
      }
    }

    function responseEmailKey(row) {
      return normalizeText(row?.email || "").trim();
    }

    function responseDateValue(row) {
      const raw = row?.response_received_at || row?.submitted_at || "";
      const timestamp = Date.parse(raw);
      return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function responseDuplicateRows(sourceRows, row) {
      const key = responseEmailKey(row);
      if (!key) return [];
      return sourceRows
        .filter((candidate) => responseEmailKey(candidate) === key && String(candidate.record_id) !== String(row.record_id))
        .sort((a, b) => responseDateValue(b) - responseDateValue(a));
    }

    function isLatestResponseForEmail(sourceRows, row) {
      const key = responseEmailKey(row);
      if (!key) return true;
      const sameEmailRows = sourceRows.filter((candidate) => responseEmailKey(candidate) === key);
      if (sameEmailRows.length <= 1) return true;
      const latest = sameEmailRows.sort((a, b) => responseDateValue(b) - responseDateValue(a))[0];
      return String(latest?.record_id || "") === String(row?.record_id || "");
    }

    function responseFieldText(field) {
      return normalizeText(`${field?.key || ""} ${field?.label || ""}`);
    }

    function responseFieldValue(field) {
      return String(field?.value || "").trim();
    }

    function normalizedDisplayValue(value) {
      const raw = String(value || "").trim();
      if (raw === "gross") return "brut";
      if (raw === "net") return "net";
      return raw;
    }

    function isUsefulResponseField(field) {
      const value = normalizedDisplayValue(responseFieldValue(field));
      if (!value) return false;
      const text = responseFieldText(field);
      if (/salaire|remuneration|rémunération/.test(text) && /^0(?:[,.]0+)?$/.test(value)) return false;
      if (/salaire|remuneration|rémunération/.test(text) && /^(brut|net|gross)$/.test(value)) return false;
      return true;
    }

    function hasVisibleResponseFields(fields) {
      return (Array.isArray(fields) ? fields : []).some((field) => isUsefulResponseField(field));
    }

    function takeResponseFields(fields, matcher) {
      const patterns = Array.isArray(matcher) ? matcher : (matcher?.patterns || []);
      const excludePatterns = Array.isArray(matcher) ? [] : (matcher?.excludePatterns || []);
      const taken = [];
      const remaining = [];
      for (const field of fields) {
        const text = responseFieldText(field);
        const excluded = excludePatterns.some((pattern) => pattern.test(text));
        const matched = !excluded && patterns.some((pattern) => pattern.test(text));
        if (matched) {
          taken.push(field);
        } else {
          remaining.push(field);
        }
      }
      return { taken, remaining };
    }

    function renderReadableValue(value, compact = false) {
      const raw = normalizedDisplayValue(value);
      if (!raw) return "-";
      const parts = raw
        .split(/\s*(?:\||;|,\s(?=[A-ZÀ-ÖØ-Þ0-9]))\s*/u)
        .map((part) => part.trim())
        .filter(Boolean);
      if (!compact || parts.length < 2 || parts.length > 14) {
        return esc(raw);
      }
      return `
        <span class="readable-list">
          ${parts.map((part) => `<span class="readable-token">${esc(part)}</span>`).join("")}
        </span>
      `;
    }

    function displayFieldLabel(field, options = {}) {
      const raw = String(field?.label || field?.key || "-").trim();
      const stripParentheses = (value) => String(value || "").replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
      const sectorLabelAliases = (value) => {
        const cleaned = stripParentheses(value);
        const aliases = [cleaned];
        if (/industrie|production/i.test(cleaned)) aliases.push("Production industrielle", "Industrie et production");
        if (/hôtellerie|hotellerie|restauration/i.test(cleaned)) aliases.push("Hôtellerie et restauration", "Hotellerie et restauration");
        if (/nettoyage|entretien/i.test(cleaned)) aliases.push("Nettoyage et entretien");
        if (/agriculture|récolte|recolte/i.test(cleaned)) aliases.push("Agriculture et récolte", "Agriculture et recolte");
        if (/vente|commerce/i.test(cleaned)) aliases.push("Vente et commerce");
        return [...new Set(aliases.filter(Boolean))];
      };
      if (options.shortLanguageLabels) {
        return raw
          .replace(/^comp[ée]tences?\s+linguistiques?\s*[·:.-]\s*/i, "")
          .replace(/^langues?\s*[·:.-]\s*/i, "")
          .trim() || raw;
      }
      if (options.projectSectorLabel) {
        let cleanedRaw = stripParentheses(raw);
        for (const sectorAlias of sectorLabelAliases(options.projectSectorLabel)) {
          const escapedSector = sectorAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          cleanedRaw = cleanedRaw
            .replace(new RegExp(`\\s*[·:.-]\\s*${escapedSector}\\s*$`, "i"), "")
            .replace(new RegExp(`^${escapedSector}\\s*[·:.-]\\s*`, "i"), "")
            .trim();
        }
        return cleanedRaw || stripParentheses(raw) || raw;
      }
      return raw;
    }

    function renderFieldRows(fields, options = {}) {
      const visible = (Array.isArray(fields) ? fields : []).filter((field) => isUsefulResponseField(field));
      if (!visible.length) {
        return `<div class="empty-state">Aucune information renseignée dans ce bloc.</div>`;
      }
      return `
        <div class="key-value">
          ${visible.map((field) => `
            <div class="key-value-row">
              <span>${esc(displayFieldLabel(field, options))}</span>
              <span>${renderReadableValue(responseFieldValue(field), Boolean(options.compactValues))}</span>
            </div>
          `).join("")}
        </div>
      `;
    }

    function fieldsWithoutLanguageSummaryDuplicates(fields) {
      const source = Array.isArray(fields) ? fields : [];
      const hasDetailedLanguageFields = source.some((field) => /competences linguistiques|compétences linguistiques/.test(responseFieldText(field)));
      if (!hasDetailedLanguageFields) return source;
      return source.filter((field) => !/^langues?$/i.test(String(field?.label || field?.key || "").trim()));
    }

    function salaryFieldType(field) {
      const label = normalizeText(field?.label || field?.key || "");
      const value = normalizeText(responseFieldValue(field));
      if (!/salaire|remuneration|rémunération/.test(label)) return "";
      if (/type de salaire|periodicite|périodicité/.test(label)) return "period";
      if (/brut ou net|brut\/net/.test(label) || /^(gross|brut|net)$/.test(value)) return "gross_net";
      if (/montant|minimum|maximum|salaire/.test(label)) return "amount";
      return "";
    }

    function readableSalaryPeriod(value) {
      const normalized = normalizeText(value);
      if (/mois|mensuel/.test(normalized)) return "mensuel";
      if (/an|annuel/.test(normalized)) return "annuel";
      if (/heure|horaire/.test(normalized)) return "horaire";
      return normalizedDisplayValue(value);
    }

    function readableGrossNet(value) {
      const normalized = normalizeText(value);
      if (/gross|brut/.test(normalized)) return "brut";
      if (/net/.test(normalized)) return "net";
      return normalizedDisplayValue(value);
    }

    function isZeroSalaryValue(value) {
      return /^0(?:[,.]0+)?$/.test(normalizeText(value));
    }

    function fieldsWithMergedSalary(fields) {
      const source = Array.isArray(fields) ? fields : [];
      const salary = {
        min: "",
        max: "",
        period: "",
        grossNet: "",
      };
      const kept = [];
      for (const field of source) {
        const type = salaryFieldType(field);
        const label = normalizeText(field?.label || field?.key || "");
        const value = normalizedDisplayValue(responseFieldValue(field));
        if (!type || !value) {
          kept.push(field);
          continue;
        }
        if (type === "amount" && !/^(brut|net|gross)$/.test(normalizeText(value)) && !isZeroSalaryValue(value)) {
          if (/maximum|max/.test(label) && !salary.max) {
            salary.max = value;
          } else if (!salary.min) {
            salary.min = value;
          } else if (!salary.max && value !== salary.min) {
            salary.max = value;
          }
        } else if (type === "period" && !salary.period) {
          salary.period = readableSalaryPeriod(value);
        } else if (type === "gross_net" && !salary.grossNet) {
          salary.grossNet = readableGrossNet(value);
        }
      }
      let amount = "";
      if (salary.min && salary.max) {
        amount = `${salary.min} à ${salary.max}`;
      } else {
        amount = salary.min || salary.max;
      }
      const numericAmount = Number(String(amount).replace(",", ".").match(/\d+(?:[.,]\d+)?/)?.[0] || "");
      const looksSuspicious = numericAmount > 1000000;
      const salaryParts = [amount, salary.period, salary.grossNet].filter(Boolean);
      if (salaryParts.length) {
        kept.push({
          label: "Salaire",
          value: looksSuspicious ? `À vérifier : ${salaryParts.join(" ")}` : salaryParts.join(" "),
        });
      }
      return kept;
    }

    function renderDocumentsBlock(row, fields) {
      const seen = new Set();
      const cleanDocumentLabel = (field) => {
        const rawLabel = String(field?.label || field?.key || "-")
          .replace(/^préparation des documents\s*[·:.-]\s*/i, "")
          .replace(/^preparation des documents\s*[·:.-]\s*/i, "")
          .trim();
        const normalizedLabel = normalizeText(rawLabel);
        if (/affiliation|securite sociale|sécurité sociale/.test(normalizedLabel)) {
          if (/luxembourg|luxembourgeois/.test(normalizedLabel)) return "Affiliation sécurité sociale Luxembourg";
          if (/allemand|allemagne/.test(normalizedLabel)) return "Affiliation sécurité sociale Allemagne";
          return "Affiliation sécurité sociale";
        }
        return rawLabel;
      };
      const documentFields = (Array.isArray(fields) ? fields : [])
        .map((field) => ({
          label: cleanDocumentLabel(field),
          value: normalizedDisplayValue(responseFieldValue(field)),
        }))
        .filter((field) => {
          const labelKey = normalizeText(field.label);
          const valueKey = normalizeText(field.value);
          if (/cv transmis|cv .*recu|cv .*reçu|cv .*nom du fichier|nom du fichier/.test(labelKey)) return false;
          if (
            /affiliation.*(securite sociale|sécurité sociale)/.test(labelKey) &&
            !/(france|luxembourg|luxembourgeois|allemagne|allemand)/.test(labelKey)
          ) return false;
          const duplicateKey = `${labelKey}:${valueKey}`;
          if (seen.has(duplicateKey)) return false;
          seen.add(duplicateKey);
          return Boolean(field.value);
        });
      if (row?.cv_download_url) {
        documentFields.unshift({
          label: "CV du candidat",
          value: "CV disponible",
          downloadUrl: row.cv_download_url,
        });
      }
      if (!hasVisibleResponseFields(documentFields) && !row?.cv_download_url) return "";
      return `
        <section class="profile-block">
          <h4>Documents</h4>
          <div class="key-value">
            ${documentFields.map((field) => {
              const normalizedValue = normalizeText(field.value);
              const isChecklistValue = /^(je l.?ai|oui|yes|true)$/.test(normalizedValue);
              const isMissingValue = /^(non|no|false|je ne l.?ai pas|manquant)$/.test(normalizedValue);
              const displayValue = isChecklistValue ? "✅" : (isMissingValue ? "❌" : field.value);
              const displayHtml = field.downloadUrl
                ? `✅ <a class="cv-inline-link" href="${esc(field.downloadUrl)}" target="_blank" rel="noopener noreferrer">Télécharger</a>`
                : esc(displayValue);
              return `
                <div class="key-value-row">
                  <span>${esc(field.label)}</span>
                  <span>${displayHtml}</span>
                </div>
              `;
            }).join("")}
          </div>
        </section>
      `;
    }

    function identityFieldType(field) {
      const label = normalizeText(field?.label || field?.key || "");
      if (/^prenom$|^prénom$/.test(label)) return "first_name";
      if (/^nom$/.test(label)) return "last_name";
      if (/adresse e-mail|adresse email|^email$|^mail$/.test(label)) return "email";
      if (/telephone|téléphone|^phone$/.test(label) && !/whatsapp/.test(label)) return "phone";
      if (/ville de residence|ville de résidence|^ville$/.test(label)) return "city";
      if (/pays de residence|pays de résidence/.test(label)) return "country";
      if (/whatsapp consent|accord whatsapp|consentement whatsapp/.test(label)) return "whatsapp_consent";
      if (/whatsapp phone|telephone whatsapp|téléphone whatsapp/.test(label)) return "whatsapp_phone";
      if (/cv|curriculum/.test(label)) return "cv";
      if (/^nom complet$|nom et prenom|nom et prénom/.test(label)) return "full_name";
      return "other";
    }

    function identityFieldPriority(field) {
      const priorities = {
        first_name: 10,
        last_name: 20,
        email: 30,
        phone: 40,
        city: 50,
        country: 60,
        whatsapp_consent: 70,
        whatsapp_phone: 80,
        cv: 90,
        full_name: 100,
        other: 200,
      };
      return priorities[identityFieldType(field)] || priorities.other;
    }

    function cleanIdentityFields(fields) {
      const source = Array.isArray(fields) ? fields : [];
      const seen = new Set();
      const hasSeparateFirstAndLastName = source.some((field) => identityFieldType(field) === "first_name")
        && source.some((field) => identityFieldType(field) === "last_name");
      return source
        .filter((field) => {
          const type = identityFieldType(field);
          const value = normalizeText(responseFieldValue(field));
          if (!value) return false;
          if (type === "full_name") return false;
          if (type === "cv") return false;
          if (type === "last_name" && hasSeparateFirstAndLastName) {
            const valueWords = value.split(/\s+/).filter(Boolean);
            if (valueWords.length > 1) return false;
          }
          const duplicateKey = `${type}:${value}`;
          if (["email", "phone", "whatsapp_phone"].includes(type) && seen.has(duplicateKey)) return false;
          seen.add(duplicateKey);
          return true;
        })
        .sort((a, b) => identityFieldPriority(a) - identityFieldPriority(b));
    }

    function mobilityFieldType(field) {
      const label = normalizeText(field?.label || field?.key || "");
      if (/^mobilite$|^mobilité$|type de mobilite|type de mobilité/.test(label)) return "mobility_type";
      if (/pays de travail acceptes|pays de travail acceptés/.test(label)) return "work_countries";
      if (/moyens? de deplacement|moyens? de déplacement|transport/.test(label)) return "transport";
      if (/autorisation particuliere|autorisation particulière/.test(label)) return "permit_extra";
      if (/permis \/ autorisations? possedes|permis \/ autorisations? possédés|permis b|permis/.test(label)) return "permit";
      if (/temps de trajet|duree de trajet|durée de trajet|trajet|distance/.test(label)) return "commute_time";
      return "other";
    }

    function mobilityFieldPriority(field) {
      const priorities = {
        mobility_type: 10,
        work_countries: 20,
        commute_time: 30,
        transport: 40,
        permit: 50,
        permit_extra: 60,
        other: 200,
      };
      return priorities[mobilityFieldType(field)] || priorities.other;
    }

    function cleanMobilityFields(fields) {
      const source = Array.isArray(fields) ? fields : [];
      const seenTypeValue = new Set();
      const hasPermitDetails = source.some((field) => mobilityFieldType(field) === "permit" && /permis b|permis/.test(normalizeText(responseFieldValue(field))));
      return source
        .filter((field) => {
          const type = mobilityFieldType(field);
          const value = normalizeText(responseFieldValue(field));
          if (!value) return false;
          if (type === "permit_extra" && /^(yes|oui|o)$/.test(value)) return false;
          if (type === "permit_extra" && hasPermitDetails && /^(yes|oui|o)$/.test(value)) return false;
          const duplicateKey = `${type}:${value}`;
          if (["mobility_type", "permit"].includes(type) && seenTypeValue.has(duplicateKey)) return false;
          seenTypeValue.add(duplicateKey);
          return true;
        })
        .sort((a, b) => mobilityFieldPriority(a) - mobilityFieldPriority(b));
    }

    function availabilityFieldType(field) {
      const label = normalizeText(field?.label || field?.key || "");
      if (/^disponibilite$|^disponibilité$/.test(label)) return "summary";
      if (/date de disponibilite|date de disponibilité/.test(label)) return "date";
      if (/types? de contrats? acceptes|types? de contrats? acceptés|contrat/.test(label)) return "contract";
      if (/disponibilites? horaires?|disponibilités? horaires?|horaire/.test(label)) return "schedule";
      if (/contraintes? de travail|contrainte/.test(label)) return "constraints";
      return "other";
    }

    function availabilityFieldPriority(field) {
      const priorities = {
        date: 10,
        contract: 20,
        schedule_constraints: 30,
        schedule: 40,
        constraints: 50,
        summary: 90,
        other: 200,
      };
      return priorities[availabilityFieldType(field)] || priorities.other;
    }

    function splitReadableParts(value) {
      return normalizedDisplayValue(value)
        .split(/\s*(?:\||;|·|,\s(?=[A-ZÀ-ÖØ-Þ0-9]))\s*/u)
        .map((part) => part.trim())
        .filter(Boolean);
    }

    function shortBusinessLabel(value) {
      return String(value || "")
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function cleanAvailabilityFields(fields) {
      const source = Array.isArray(fields) ? fields : [];
      const hasDetailedAvailability = source.some((field) => ["date", "contract", "schedule", "constraints"].includes(availabilityFieldType(field)));
      const seenTypeValue = new Set();
      let scheduleValue = "";
      const workConditionParts = [];
      const filtered = source
        .filter((field) => {
          const type = availabilityFieldType(field);
          const displayValue = normalizedDisplayValue(responseFieldValue(field));
          const value = normalizeText(displayValue);
          if (!displayValue) return false;
          if (type === "summary" && hasDetailedAvailability) return false;
          if (type === "schedule" || type === "constraints") {
            if (type === "schedule") {
              scheduleValue = /horaires? varies?|horaires? variés?|disponible sur des horaires? varies?|disponible sur des horaires? variés?/.test(value)
                ? "Pas de contraintes horaires"
                : displayValue;
            } else {
              splitReadableParts(displayValue).forEach((part) => {
                const normalizedPart = normalizeText(part);
                if (!normalizedPart || /aucune condition particuliere|aucune condition particulière/.test(normalizedPart)) return;
                if (!workConditionParts.some((existing) => normalizeText(existing) === normalizedPart)) {
                  workConditionParts.push(part);
                }
              });
              if (!workConditionParts.length) {
                workConditionParts.push("Pas de conditions particulières");
              }
            }
            return false;
          }
          const duplicateKey = `${type}:${value}`;
          if (seenTypeValue.has(duplicateKey)) return false;
          seenTypeValue.add(duplicateKey);
          return true;
        });
      if (source.some((field) => availabilityFieldType(field) === "schedule")) {
        filtered.push({
          label: "Horaires",
          value: scheduleValue || "Pas de contraintes horaires",
          display_type: "schedule",
        });
      }
      if (workConditionParts.length) {
        filtered.push({
          label: "Conditions de travail",
          value: workConditionParts.join(" | "),
          display_type: "work_conditions",
        });
      }
      return filtered
        .sort((a, b) => availabilityFieldPriority(a) - availabilityFieldPriority(b));
    }

    function projectFieldGroupsForResponse(role) {
      const common = [
        {
          title: "Agriculture et récolte",
          patterns: [/agriculture/, /recolte/, /récolte/, /maraichage/, /maraîchage/, /viticulture/, /cueillette/],
        },
        {
          title: "Nettoyage et entretien",
          patterns: [/nettoyage/, /entretien/, /proprete/, /propreté/, /espaces collectifs/],
        },
        {
          title: "Hôtellerie et restauration",
          patterns: [/hotellerie/, /hôtellerie/, /restauration/, /plonge/, /service/, /cuisine/],
        },
        {
          title: "Vente et commerce",
          patterns: [/vente/, /commerce/, /pret a porter/, /prêt-à-porter/, /chaussure/, /commercial/],
        },
        {
          title: "Transport et logistique",
          patterns: [/transport/, /logistique/, /chauffeur/, /livraison/, /magasinier/, /cariste/],
        },
        {
          title: "Industrie et production",
          patterns: [/industrie/, /production/, /operateur/, /opérateur/, /usine/, /maintenance/],
        },
        {
          title: "Bâtiment et travaux",
          patterns: [/batiment/, /bâtiment/, /btp/, /travaux/, /chantier/, /macon/, /maçon/],
        },
      ];
      if (role === "employer") {
        return common.map((group) => ({ ...group, title: `Besoin métier — ${group.title}` }));
      }
      return common.map((group) => ({ ...group, title: `Projet métier — ${group.title}` }));
    }

    function selectedProjectGroupTitles(fields, role) {
      const fieldTexts = (Array.isArray(fields) ? fields : [])
        .filter((field) => isUsefulResponseField(field))
        .map((field) => `${responseFieldText(field)} ${normalizeText(responseFieldValue(field))}`);
      return projectFieldGroupsForResponse(role)
        .filter((group) => fieldTexts.some((text) => group.patterns.some((pattern) => pattern.test(text))))
        .map((group) => group.title);
    }

    function extractCandidateResidenceFromMobility(fields) {
      const residenceFields = [];
      const workCountries = [];
      const remainingFields = [];
      for (const field of Array.isArray(fields) ? fields : []) {
        const label = String(field.label || field.key || "");
        const text = responseFieldText(field);
        const value = normalizedDisplayValue(responseFieldValue(field));
        const isCountryMobilityField = /projet de mobilite par pays|projet de mobilité par pays/.test(text);
        if (!isCountryMobilityField) {
          remainingFields.push(field);
          continue;
        }
        if (/j.?y habite/.test(normalizeText(value))) {
          const country = label
            .split(/[·:|-]/)
            .map((part) => part.trim())
            .filter(Boolean)
            .pop();
          if (country) {
            residenceFields.push({
              label: "Pays de résidence",
              value: country,
            });
          }
        } else if (/je veux y travailler/.test(normalizeText(value))) {
          const country = label
            .split(/[·:|-]/)
            .map((part) => part.trim())
            .filter(Boolean)
            .pop();
          if (country && !workCountries.some((existing) => normalizeText(existing) === normalizeText(country))) {
            workCountries.push(country);
          }
        }
      }
      const workCountryField = workCountries.length ? [{
        label: "Pays de travail acceptés",
        value: workCountries.join(" | "),
      }] : [];
      return [...residenceFields, ...workCountryField, ...remainingFields];
    }

    function renderHistoryResponseStructuredFields(row, role) {
      let remaining = Array.isArray(row.fields) ? [...row.fields] : [];
      if (!remaining.length) {
        return `<div class="empty-state">Aucun champ détaillé disponible pour cette réponse.</div>`;
      }
      const isCandidate = role === "candidate";
      if (isCandidate) {
        remaining = extractCandidateResidenceFromMobility(remaining);
      }
      const commonGroups = isCandidate ? [
        {
          title: "Identité et contact",
          patterns: [/nom\b/, /prenom/, /email/, /mail/, /telephone/, /phone/, /whatsapp/, /ville/, /adresse/, /pays de residence/, /pays de résidence/],
        },
        {
          title: "Langues",
          patterns: [/langue/, /linguistique/],
        },
        {
          title: "Mobilité",
          patterns: [/mobilite/, /mobilité/, /deplacement/, /déplacement/, /permis/, /vehicule/, /véhicule/, /frontiere/, /frontière/, /trajet/, /distance/, /pays de travail acceptes/, /pays de travail acceptés/],
          excludePatterns: [/projet de mobilite par pays/, /projet de mobilité par pays/],
        },
      ] : [
        {
          title: "Entreprise et contact",
          patterns: [/entreprise/, /employeur/, /structure/, /contact/, /email/, /mail/, /telephone/, /phone/],
        },
        {
          title: "Localisation et calendrier général",
          patterns: [/pays/, /lieu/, /ville/, /localisation/, /date de debut/, /date de début/, /debut souhaite/, /début souhaité/],
        },
        {
          title: "Communication",
          patterns: [/whatsapp/, /contact/, /telephone/, /phone/, /mail/, /email/],
        },
      ];
      const renderedGroups = [];
      for (const group of commonGroups) {
        const result = takeResponseFields(remaining, group);
        remaining = result.remaining;
        let displayFields = result.taken;
        if (group.title === "Identité et contact") {
          displayFields = cleanIdentityFields(displayFields);
        }
        if (group.title === "Langues") {
          displayFields = fieldsWithoutLanguageSummaryDuplicates(displayFields);
        }
        if (group.title === "Mobilité") {
          displayFields = cleanMobilityFields(displayFields);
        }
        if (!hasVisibleResponseFields(displayFields)) continue;
        const isReadabilityFocus = group.title === "Langues" || group.title === "Mobilité";
        renderedGroups.push(`
          <section class="profile-block ${group.highlight ? "job-highlight" : ""} ${isReadabilityFocus ? "is-readability-focus" : ""}">
            <h4>${esc(group.title)}</h4>
            ${renderFieldRows(displayFields, { compactValues: isReadabilityFocus, shortLanguageLabels: group.title === "Langues" })}
          </section>
        `);
      }
      for (const group of projectFieldGroupsForResponse(role)) {
        const result = takeResponseFields(remaining, group);
        remaining = result.remaining;
        const projectFields = fieldsWithMergedSalary(result.taken);
        if (!hasVisibleResponseFields(projectFields)) continue;
        const projectSectorLabel = group.title.replace(/^Projet métier — |^Besoin métier — /, "");
        renderedGroups.push(`
          <section class="profile-block job-highlight">
            <h4>${esc(group.title)}</h4>
            ${renderFieldRows(projectFields, { projectSectorLabel })}
          </section>
        `);
      }
      const genericProjectResult = takeResponseFields(remaining, [/metier/, /métier/, /secteur/, /poste/, /intitule/, /intitulé/, /emploi/, /competence/, /compétence/, /mission/, /experience/, /expérience/, /formation/]);
      remaining = genericProjectResult.remaining;
      const genericConditionsResult = takeResponseFields(remaining, [/disponibilite/, /disponibilité/, /debut/, /début/, /contrat/, /horaire/, /temps/, /salaire/, /remuneration/, /rémunération/, /contrainte/]);
      remaining = genericConditionsResult.remaining;
      const displayConditionFields = isCandidate ? cleanAvailabilityFields(genericConditionsResult.taken) : genericConditionsResult.taken;
      if (hasVisibleResponseFields(displayConditionFields)) {
        renderedGroups.push(`
          <section class="profile-block">
            <h4>${esc(isCandidate ? "Disponibilité et contraintes générales" : "Conditions générales du poste")}</h4>
            ${renderFieldRows(displayConditionFields)}
          </section>
        `);
      }
      if (isCandidate) {
        const documentsResult = takeResponseFields(remaining, [/cv/, /curriculum/, /document/, /fichier/, /piece/, /pièce/, /justificatif/, /affiliation/, /sécurité sociale/, /securite sociale/]);
        const documentFieldsForOtherInfo = documentsResult.taken.filter((field) => /cv transmis|cv .*recu|cv .*reçu|cv .*nom du fichier|nom du fichier/.test(responseFieldText(field)));
        const documentFieldsForBlock = documentsResult.taken.filter((field) => !documentFieldsForOtherInfo.includes(field));
        remaining = [...documentsResult.remaining, ...documentFieldsForOtherInfo];
        const documentsBlock = renderDocumentsBlock(row, documentFieldsForBlock);
        if (documentsBlock) renderedGroups.push(documentsBlock);
      }
      if (hasVisibleResponseFields(remaining)) {
        renderedGroups.push(`
          <section class="profile-block">
            <h4>Autres informations</h4>
            ${renderFieldRows(remaining)}
          </section>
        `);
      }
      return `
        <section class="notes-box">
          <h4>${esc(isCandidate ? "Lecture structurée de la réponse candidat" : "Lecture structurée de la réponse employeur")}</h4>
          <div class="profile-section">
            ${renderedGroups.join("") || `<div class="empty-state">Aucun champ détaillé disponible pour cette réponse.</div>`}
          </div>
        </section>
      `;
    }

    function readableResponseDate(value) {
      if (!value) return "-";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return parsed.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    function responseOverviewParts(row, isCandidate) {
      const parts = splitReadableParts(row.subtitle || "");
      const cleanOverviewLabel = (value) => shortBusinessLabel(value);
      const sectors = [];
      const countries = [];
      for (const part of parts) {
        const cleanPart = cleanOverviewLabel(part);
        const normalized = normalizeText(cleanPart);
        if (!cleanPart) continue;
        if (/allemagne|france|luxembourg|autre pays|union europeenne|hors ue|ue$/.test(normalized)) {
          countries.push(cleanPart);
        } else {
          sectors.push(cleanPart);
        }
      }
      const fallbackSubtitle = row.subtitle && !parts.length ? cleanOverviewLabel(row.subtitle) : "";
      return {
        typeLabel: isCandidate ? "Candidat" : "Employeur",
        statusLabel: row.is_active === false ? "Archivée" : "Active",
        statusClass: row.is_active === false ? "refused" : "accepted",
        responseDate: readableResponseDate(row.response_received_at || row.submitted_at || ""),
        sectors: sectors.length ? sectors : (fallbackSubtitle ? [fallbackSubtitle] : []),
        countries,
      };
    }

    function renderResponseOverview(row, isCandidate) {
      const overview = responseOverviewParts(row, isCandidate);
      const hasSectors = overview.sectors.length > 0;
      const hasCountries = overview.countries.length > 0;
      return `
        <div class="summary-tags">
          <span class="pill ${isCandidate ? "role-candidate" : "role-employer"}">${esc(overview.typeLabel)}</span>
          <span class="pill ${overview.statusClass}">${esc(overview.statusLabel)}</span>
          <span class="pill">Réponse : ${esc(overview.responseDate)}</span>
          <span class="pill">${esc(row.matching_count || 0)} matching(s)</span>
          ${row.cv_download_url ? `<span class="pill accepted">CV disponible</span>` : ""}
        </div>
        ${(hasSectors || hasCountries) ? `
          <div class="response-overview">
            ${hasSectors ? `
              <div class="response-overview-row">
                <strong>${esc(isCandidate ? "Secteurs" : "Besoin")}</strong>
                <div class="readable-list">${overview.sectors.map((sector) => `<span class="readable-token">${esc(sector)}</span>`).join("")}</div>
              </div>
            ` : ""}
            ${hasCountries ? `
              <div class="response-overview-row">
                <strong>Pays</strong>
                <div class="readable-list">${overview.countries.map((country) => `<span class="readable-token">${esc(country)}</span>`).join("")}</div>
              </div>
            ` : ""}
          </div>
        ` : ""}
      `;
    }

    function linkedMatchingShortParts(matching) {
      const subtitleParts = splitReadableParts(matching.counterpart_subtitle || "").map(shortBusinessLabel).filter(Boolean);
      const sectors = [];
      const locations = [];
      for (const part of subtitleParts) {
        const normalized = normalizeText(part);
        if (/allemagne|france|luxembourg|autre pays|union europeenne|hors ue|ue$/.test(normalized)) {
          locations.push(part);
        } else {
          sectors.push(part);
        }
      }
      return {
        name: matching.counterpart_name || "-",
        sector: sectors.join(" · ") || "-",
        location: locations.join(" · "),
        score: matching.score ?? "-",
        status: workflowStatusLabel(matching.workflow_status),
      };
    }

    function renderLinkedMatchings(matchings) {
      return `
        <div class="linked-matching-list">
          ${matchings.map((matching) => {
            const parts = linkedMatchingShortParts(matching);
            return `
              <article class="linked-matching-row">
                <div class="linked-matching-summary">
                  <span class="linked-matching-name">${esc(parts.name)}</span>
                  <span class="linked-matching-sector" title="${esc(parts.sector)}">${esc(parts.sector)}</span>
                  <span class="linked-matching-score">${esc(parts.score)}/100</span>
                  <span class="linked-matching-status" title="${esc(parts.status)}">${esc(parts.status)}</span>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderHistoryQuestionnaireRows(role) {
      const isCandidate = role === "candidate";
      const search = normalizeText(state.dataHistorySearch || "");
      const sourceRows = isCandidate ? state.candidateResponses.rows : state.employerResponses.rows;
      const rows = sourceRows.filter((row) => {
        if (!search) return true;
        return normalizeText([
          row.title,
          row.subtitle,
          row.email,
          row.company_name,
          row.response_received_at,
          row.submitted_at,
          row.response_status,
          row.matching_count,
        ].join(" ")).includes(search);
      });
      const list = document.getElementById(isCandidate ? "history-candidate-list" : "history-employer-list");
      if (!list) return;
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state">${search ? "Aucune réponse ne correspond à la recherche." : "Aucune réponse chargée."}</div>`;
        return;
      }
      list.innerHTML = rows.map((row) => {
        const duplicates = responseDuplicateRows(sourceRows, row);
        const hasDuplicates = duplicates.length > 0;
        const latestForEmail = isLatestResponseForEmail(sourceRows, row);
        return `
        <article class="matching-card">
          <div class="matching-summary">
            <div>
              <h2>${esc(row.title || (isCandidate ? "Candidat" : "Employeur"))}</h2>
              ${renderResponseOverview(row, isCandidate)}
              ${hasDuplicates ? `<div class="summary-tags">
                <span class="pill warning">Doublon email : ${esc(duplicates.length + 1)} réponses</span>
                <span class="pill ${latestForEmail ? "accepted" : "refused"}">${esc(latestForEmail ? "Réponse la plus récente" : "Ancienne réponse")}</span>
              </div>` : ""}
            </div>
          </div>
          <details class="history-response-details">
            <summary>${esc(isCandidate ? "Voir la fiche candidat" : "Voir la fiche employeur")}</summary>
            <div class="history-response-content">
              ${row.response_disabled_reason ? `<p style="margin:0; line-height:1.7;"><strong>Motif d’archivage :</strong> ${esc(row.response_disabled_reason)}</p>` : ""}
              ${hasDuplicates ? `
                <section class="notes-box">
                  <h4>Doublons détectés sur cet email</h4>
                  <p style="margin:0 0 0.8rem; color:var(--muted); line-height:1.7;">
                    Règle pilote : garder la réponse la plus récente et archiver les anciennes si elles ne doivent plus servir aux matchings.
                  </p>
                  <div class="detail-list">
                    ${duplicates.map((duplicate) => `
                      <div class="detail-row" style="grid-template-columns:minmax(0, 1fr) auto; align-items:center;">
                        <div>
                          <strong>${esc(duplicate.title || duplicate.email || "-")}</strong>
                          <div style="color:var(--muted); margin-top:0.2rem;">
                            Réponse : ${esc(duplicate.response_received_at || duplicate.submitted_at || "-")} ·
                            ${esc(duplicate.is_active === false ? "archivée" : "active")} ·
                            ${esc(duplicate.matching_count || 0)} matching(s)
                          </div>
                        </div>
                        <span class="pill">${esc(isLatestResponseForEmail(sourceRows, duplicate) ? "plus récente" : "ancienne")}</span>
                      </div>
                    `).join("")}
                  </div>
                </section>
              ` : ""}
              ${Array.isArray(row.matchings) && row.matchings.length ? `
                <section class="notes-box">
                  <h4>${esc(isCandidate ? "Matchings liés" : "Matchings liés")}</h4>
                  ${renderLinkedMatchings(row.matchings)}
                </section>
              ` : ""}
              ${renderHistoryResponseStructuredFields(row, role)}
              <section class="notes-box">
                <h4>Gestion de cette réponse</h4>
                <p style="margin:0 0 0.8rem; color:var(--muted); line-height:1.7;">
                  Archiver retire cette réponse des nouveaux matchings, sans la supprimer de l’historique.
                </p>
                <div class="compact-response-actions">
                  <input id="history-response-note-${esc(role)}-${esc(row.record_id)}" type="text" placeholder="Motif d’archivage optionnel" value="${esc(row.response_disabled_reason || (hasDuplicates && !latestForEmail ? "Ancienne réponse remplacée par une réponse plus récente." : ""))}">
                  <div class="hero-actions">
                    ${row.is_active === false
                      ? `<button type="button" data-history-response-status-action="active" data-role="${esc(role)}" data-record-id="${esc(row.record_id)}">Réactiver</button>`
                      : `<button class="btn-refuse" type="button" data-history-response-status-action="disabled" data-role="${esc(role)}" data-record-id="${esc(row.record_id)}">Archiver cette réponse</button>`
                    }
                  </div>
                </div>
              </section>
            </div>
          </details>
        </article>
      `;
      }).join("");
      for (const button of list.querySelectorAll("[data-open-matching]")) {
        button.addEventListener("click", async (event) => {
          const matchingRecordId = Number(event.currentTarget.dataset.openMatching || 0);
          if (!matchingRecordId) return;
          await openMatchingRecord(matchingRecordId);
        });
      }
      for (const button of list.querySelectorAll("[data-history-response-status-action]")) {
        button.addEventListener("click", async (event) => {
          const recordId = Number(event.currentTarget.dataset.recordId || 0);
          const roleValue = event.currentTarget.dataset.role || "";
          const status = event.currentTarget.dataset.historyResponseStatusAction || "";
          const note = document.getElementById(`history-response-note-${roleValue}-${recordId}`)?.value || "";
          if (!recordId || !roleValue || !status) return;
          await updateQuestionnaireResponseStatus(roleValue, recordId, status, note);
          renderDataHistoryView();
        });
      }
    }

    function renderHistoryMatchingRows() {
      const list = document.getElementById("history-matching-list");
      if (!list) return;
      const search = normalizeText(state.dataHistorySearch || "");
      const rows = state.matchings.rows.filter((row) => {
        if (!search) return true;
        return normalizeText([
          row.candidat?.nom,
          row.candidat?.email,
          row.candidat_id,
          row.employeur?.employeur,
          row.employeur?.contact,
          row.employeur?.poste,
          row.employeur?.pays,
          row.besoin_id,
          row.score,
          adminStatusLabel(row.admin_status),
          workflowStatusLabel(row.workflow_status),
          employerResponseLabel(row.employer_response),
          row.date_calcul,
        ].join(" ")).includes(search);
      });
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state">${search ? "Aucun matching ne correspond à la recherche." : "Aucun matching chargé."}</div>`;
        return;
      }
      list.innerHTML = rows.map((row) => {
        const workflowStatus = String(row.workflow_status || "").trim().toLowerCase();
        const adminStatus = String(row.admin_status || "").trim().toLowerCase();
        const terminalWorkflowStatuses = new Set([
          "envoye_employeur",
          "accepte_employeur",
          "refuse_employeur",
          "mise_en_relation_faite",
          "embauche_confirmee",
          "relation_terminee",
          "refuse_admin",
        ]);
        const alreadyValidated = adminStatus === "accepted" || workflowStatus === "valide_admin";
        const actionsHtml = terminalWorkflowStatuses.has(workflowStatus)
          ? ""
          : alreadyValidated
            ? `<button class="btn-accept" type="button" data-history-matching-action="accepted">Envoyer les mails employeur + candidat</button>
               <button class="btn-refuse" type="button" data-history-matching-action="refused">Refuser</button>`
            : `<button class="btn-accept" type="button" data-history-matching-action="accepted">Accepter + envoyer</button>
               <button class="btn-refuse" type="button" data-history-matching-action="refused">Refuser</button>`;
        return `
        <article class="matching-card" data-record-id="${esc(row.record_id)}">
          <div class="matching-summary">
            <div>
              <h2>${esc(row.candidat?.nom || "Candidat")} · ${esc(row.employeur?.employeur || "Employeur")}</h2>
              <p>${esc(row.employeur?.poste || "-")} · ${esc(row.employeur?.pays || row.employeur?.localisation || "-")}</p>
              <div class="summary-tags">
                <span class="pill">Score : ${esc(row.score ?? "-")}/100</span>
                <span class="pill">Décision : ${esc(adminStatusLabel(row.admin_status))}</span>
                <span class="pill">Workflow : ${esc(workflowStatusLabel(row.workflow_status))}</span>
                <span class="pill">Créé : ${esc(row.date_calcul || "-")}</span>
              </div>
            </div>
            ${actionsHtml ? `<div class="decision-actions">${actionsHtml}</div>` : ""}
          </div>
        </article>
      `;
      }).join("");

      for (const button of list.querySelectorAll("[data-history-matching-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const decision = event.currentTarget.dataset.historyMatchingAction;
          if (!recordId || !decision) return;
          await submitDecision(recordId, decision, "", "", "");
          await loadMatchings();
          renderHistoryMatchingRows();
        });
      }
    }

    function renderHistoryInvitationRows() {
      const list = document.getElementById("history-invitation-list");
      if (!list) return;
      const search = normalizeText(state.dataHistorySearch || "");
      const rows = state.invitations.rows.filter((row) => {
        if (row.invitation_status === "invitation_a_envoyer") return false;
        if (!search) return true;
        return normalizeText([
          row.email,
          row.role,
          row.company_name,
          row.first_name,
          row.last_name,
          row.invitation_status,
          invitationStatusLabel(row.invitation_status),
          invitationDeliveryLabel(row),
          invitationDeliveryChannel(row),
          row.sent_at,
          row.invitation_status_updated_at,
        ].join(" ")).includes(search);
      });
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state">${search ? "Aucune invitation ne correspond à la recherche." : "Aucune invitation envoyée ou historisée chargée."}</div>`;
        return;
      }
      list.innerHTML = rows.map((row) => `
        <article class="history-invitation-row">
          <strong title="${esc(row.email || "-")}">${esc(row.email || "-")}</strong>
          <span class="history-invitation-subject" title="${esc(row.company_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "-")}">
            ${esc(row.role === "employer" ? "Employeur" : "Candidat")}
            · ${esc(row.company_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "-")}
          </span>
          <span class="history-invitation-date">${esc(readableResponseDate(row.sent_at || row.invitation_status_updated_at || ""))}</span>
          <span class="pill ${esc(invitationStatusClass(row.invitation_status))}">${esc(invitationDeliveryLabel(row))}</span>
        </article>
      `).join("");
    }

    function renderDataHistoryView() {
      if (state.dataHistoryView === "candidate-responses") renderHistoryQuestionnaireRows("candidate");
      if (state.dataHistoryView === "employer-responses") renderHistoryQuestionnaireRows("employer");
      if (state.dataHistoryView === "matchings") renderHistoryMatchingRows();
      if (state.dataHistoryView === "invitations") renderHistoryInvitationRows();
    }

    function clearResponseWatch(role) {
      const stateKey = role === "candidate" ? "candidateResponses" : "employerResponses";
      state[stateKey].unseenCount = 0;
      renderGlobalResponseWatch();
    }

    function questionnaireResponseSignature(rows) {
      if (!Array.isArray(rows) || !rows.length) return "";
      return rows
        .map((row) => `${row.record_id}:${row.response_received_at || row.submitted_at || ""}:${row.response_status || ""}`)
        .join("|");
    }

    function renderBrevoStatus(health) {
      const message = health?.message || "état inconnu";
      const diagnosticList = document.getElementById("brevo-diagnostic-list");
      if (diagnosticList) {
        const statusLabels = {
          ok: "OK",
          warning: "À vérifier",
          error: "Erreur",
          pending: "En cours",
          not_checked: "Non vérifié"
        };
        const checks = Array.isArray(health?.checks) ? health.checks : [];
        diagnosticList.innerHTML = checks.length
          ? checks.map((check) => {
              const status = String(check.status || "not_checked");
              const label = statusLabels[status] || status;
              return `
                <div class="technical-check-item">
                  <div>
                    <strong>${esc(check.label || "Contrôle")}</strong>
                    <p>${esc(check.detail || "")}</p>
                  </div>
                  <span class="technical-check-status ${esc(status)}">${esc(label)}</span>
                </div>
              `;
            }).join("")
          : `<div class="technical-check-item"><div><strong>Diagnostic indisponible</strong><p>Aucun détail technique n’a été renvoyé par le serveur.</p></div><span class="technical-check-status not_checked">Non vérifié</span></div>`;
      }
      if (!health?.configured) {
        document.getElementById("brevo-health-title").textContent = "Configuration incomplète";
        setStatus("brevo-status-line", `Brevo : configuration incomplète. ${message}`);
        return;
      }
      if (health.api_ok === false) {
        document.getElementById("brevo-health-title").textContent = "Incident Brevo";
        setStatus("brevo-status-line", `Brevo : incident API. ${message}`);
        return;
      }
      if (health.api_ok === true) {
        document.getElementById("brevo-health-title").textContent = "Brevo opérationnel";
        setStatus("brevo-status-line", `Brevo : opérationnel. ${message}`);
        return;
      }
      document.getElementById("brevo-health-title").textContent = "Configuration OK";
      setStatus("brevo-status-line", `Brevo : configuration OK. ${message}`);
    }

    function renderVisitAnalyticsSummary(summary) {
      const events = summary?.events || {};
      document.getElementById("visit-analytics-page-views").textContent = Number(events.page_view || 0);
      document.getElementById("visit-analytics-cta-clicks").textContent = Number(events.cta_click || 0);
      document.getElementById("visit-analytics-started").textContent = Number(events.questionnaire_started || 0);
      document.getElementById("visit-analytics-submitted").textContent = Number(events.questionnaire_submitted || 0);
      const details = document.getElementById("visit-analytics-details");
      const sources = Array.isArray(summary?.sources) ? summary.sources.slice(0, 8) : [];
      const pageBreakdown = Array.isArray(summary?.page_breakdown) ? summary.page_breakdown.slice(0, 12) : [];
      const sourceRows = sources.length
        ? sources.map((item) => `<li>${esc(item.source || "direct")} : <strong>${esc(item.count || 0)}</strong></li>`).join("")
        : "<li>Aucune source enregistrée.</li>";
      const pageRows = pageBreakdown.length
        ? `
          <div class="visit-page-table">
            ${pageBreakdown.map((item) => `
              <div class="visit-page-row">
                <strong>${esc(item.page || "inconnue")}</strong>
                <div class="visit-page-metrics">
                  <div class="visit-page-metric"><em>Visites</em><span>${esc(item.page_view || 0)}</span></div>
                  <div class="visit-page-metric"><em>Clics</em><span>${esc(item.cta_click || 0)}</span></div>
                  <div class="visit-page-metric"><em>Commencés</em><span>${esc(item.questionnaire_started || 0)}</span></div>
                  <div class="visit-page-metric"><em>Envoyés</em><span>${esc(item.questionnaire_submitted || 0)}</span></div>
                </div>
              </div>
            `).join("")}
          </div>
        `
        : "<p>Aucune page enregistrée.</p>";
      const storageDurable = Boolean(summary?.storage?.durable);
      const storageLabel = storageDurable ? "Durable" : "Temporaire";
      const storageClass = storageDurable ? "ok" : "warning";
      details.innerHTML = `
        <div class="technical-check-item">
          <div>
            <strong>Sources principales</strong>
            <ul>${sourceRows}</ul>
          </div>
          <span class="technical-check-status ok">30 jours</span>
        </div>
        <div class="technical-check-item wide">
          <div>
            <strong>Pages distinguées</strong>
            ${pageRows}
          </div>
          <span class="technical-check-status ok">${esc(summary?.total_events || 0)} événements</span>
        </div>
        <div class="technical-check-item">
          <div>
            <strong>Stockage</strong>
            <p>${esc(summary?.storage?.warning || "Stockage temporaire serveur.")}</p>
          </div>
          <span class="technical-check-status ${storageClass}">${storageLabel}</span>
        </div>
      `;
      setStatus("visit-analytics-status-line", `Visites chargées sur ${Number(summary?.days || 30)} jours.`);
    }

    function scoreStatusLabel(row) {
      if (row.scoring_status === "auto_envoyable") return "score fort initial";
      if (row.scoring_status === "a_valider") return "proposé à validation";
      if (row.scoring_status === "a_ecarter") return "faible score initial";
      return row.scoring_status || "inconnu";
    }

    function adminStatusLabel(status) {
      if (status === "accepted") return "accepté";
      if (status === "refused") return "refusé";
      return "à décider";
    }

    function employerResponseLabel(status) {
      if (status === "contact") return "va contacter";
      if (status === "not_contact") return "ne contactera pas";
      return "aucun retour employeur";
    }

    function employerWhatsappBadge(row) {
      const consent = row.employer_whatsapp_consent || "";
      if (consent === "yes") {
        const phone = row.employer_whatsapp_phone ? ` · ${row.employer_whatsapp_phone}` : "";
        const confirmed = row.employer_whatsapp_confirmed_at ? ` · confirmé le ${row.employer_whatsapp_confirmed_at}` : "";
        return `<span class="pill accepted">Employeur : WhatsApp OK${esc(phone)}${esc(confirmed)}</span>`;
      }
      if (consent === "no") {
        return `<span class="pill refused">Employeur : sans WhatsApp</span>`;
      }
      return `<span class="pill pending">Employeur : WhatsApp non répondu</span>`;
    }

    function matchingNextAction(row) {
      if (row.workflow_status === "accepte_employeur") {
        if (row.employer_whatsapp_consent === "yes") {
          return {
            title: "Action attendue : créer ou renseigner la mise en relation",
            text: "L’employeur a accepté le candidat et WhatsApp est validé. Tu dois créer le groupe WhatsApp, puis marquer la mise en relation comme faite.",
            note: "Si le groupe est déjà créé, utilise directement “Mise en relation faite”."
          };
        }
        if (row.employer_whatsapp_consent === "no") {
          return {
            title: "Action attendue : suivre la mise en relation hors WhatsApp",
            text: "L’employeur a accepté le candidat mais ne souhaite pas WhatsApp. Tu dois suivre le contact par email ou téléphone, puis mettre à jour le résultat.",
            note: "Cette situation reste utile pour comparer le parcours avec et sans WhatsApp."
          };
        }
        return {
          title: "Action attendue : choisir la suite de mise en relation",
          text: "L’employeur a accepté le candidat, mais n’a pas répondu sur WhatsApp. Tu dois soit le relancer/confirmer son canal, soit traiter cette mise en relation hors WhatsApp.",
          note: "Une fois la suite décidée, mets à jour le workflow ou le résultat pour sortir cette carte de la file."
        };
      }
      if (row.workflow_status === "a_valider_admin" || row.admin_status === "pending") {
        return {
          title: "Action attendue : arbitrer le matching",
          text: "Le système propose ce rapprochement. Tu dois vérifier les écarts candidat/employeur puis accepter ou refuser le matching.",
          note: "Le score aide à prioriser, mais la décision finale reste métier."
        };
      }
      if (row.workflow_status === "envoye_employeur") {
        return {
          title: "Action attendue : attendre ou relancer l’employeur",
          text: "Le matching a été envoyé à l’employeur. Tant qu’il n’a pas répondu, il n’y a pas de décision métier à prendre ici.",
          note: "La relance doit être gérée depuis la partie invitations/relances si elle est nécessaire."
        };
      }
      return {
        title: "Action attendue : contrôler l’état",
        text: "Cette carte est surtout informative. Si elle apparaît dans une file à traiter, vérifie le workflow et mets-le à jour.",
        note: ""
      };
    }

    function renderMatchingNextAction(row) {
      const action = matchingNextAction(row);
      return `
        <section class="next-action-box">
          <strong>${esc(action.title)}</strong>
          <p>${esc(action.text)}</p>
          ${action.note ? `<p class="microcopy">${esc(action.note)}</p>` : ""}
        </section>
      `;
    }

    function relationChannel(row) {
      if (row.relation_channel === "whatsapp") return "WhatsApp";
      if (row.relation_channel === "email") return "Email";
      if (row.relation_channel === "telephone") return "Téléphone";
      if (row.relation_channel === "autre") return "Autre";
      if (row.employer_whatsapp_consent === "yes") return "WhatsApp";
      if (row.employer_whatsapp_consent === "no") return "Email / téléphone";
      return "Canal à décider";
    }

    function relationResultLabel(result) {
      const labels = {
        contact_etabli: "Contact établi",
        entretien_prevu: "Entretien prévu",
        entretien_realise: "Entretien réalisé",
        sans_reponse_candidat: "Sans réponse candidat",
        sans_reponse_employeur: "Sans réponse employeur",
        refus_candidat: "Refus candidat",
        refus_employeur: "Refus employeur",
        sans_suite: "Sans suite",
        embauche_confirmee: "Embauche confirmée",
        autre: "Autre",
      };
      return labels[result] || "Non renseigné";
    }

    function relationResultOptions(selectedValue = "") {
      const options = [
        ["", "Sélectionner un résultat"],
        ["contact_etabli", "Contact établi"],
        ["entretien_prevu", "Entretien prévu"],
        ["entretien_realise", "Entretien réalisé"],
        ["sans_reponse_candidat", "Sans réponse candidat"],
        ["sans_reponse_employeur", "Sans réponse employeur"],
        ["refus_candidat", "Refus candidat"],
        ["refus_employeur", "Refus employeur"],
        ["sans_suite", "Sans suite"],
        ["embauche_confirmee", "Embauche confirmée"],
        ["autre", "Autre"],
      ];
      return options.map(([value, label]) => `<option value="${esc(value)}" ${value === selectedValue ? "selected" : ""}>${esc(label)}</option>`).join("");
    }

    function relationChannelOptions(row) {
      const selectedValue = row.relation_channel || (row.employer_whatsapp_consent === "yes" ? "whatsapp" : "");
      const options = [
        ["", "Choisir le canal réel"],
        ["whatsapp", "WhatsApp"],
        ["email", "Email"],
        ["telephone", "Téléphone"],
        ["autre", "Autre"],
      ];
      return options.map(([value, label]) => `<option value="${esc(value)}" ${value === selectedValue ? "selected" : ""}>${esc(label)}</option>`).join("");
    }

    function relationViewTarget(target) {
      const map = {
        "to-launch": "to-launch",
        "in-progress": "in-progress",
      };
      return map[target] || "";
    }

    function relationViewCopy(view) {
      const copy = {
        "to-launch": {
          title: "Contacts à créer",
          text: "Matchings acceptés par l’employeur : il faut maintenant créer le contact réel, WhatsApp ou hors WhatsApp."
        },
        "in-progress": {
          title: "Relations à suivre ou clôturer",
          text: "Contacts déjà lancés : suivre l’échange et renseigner l’issue dès qu’elle est connue."
        },
      };
      return copy[view] || copy["to-launch"];
    }

    function setRelationsView(view) {
      const normalizedView = relationViewTarget(view) || "to-launch";
      state.relationsView = normalizedView;
      const copy = relationViewCopy(normalizedView);
      document.getElementById("relations-view-title").textContent = copy.title;
      document.getElementById("relations-view-copy").textContent = copy.text;
      for (const button of document.querySelectorAll("[data-open-relations]")) {
        button.classList.toggle("active", relationViewTarget(button.dataset.openRelations) === normalizedView);
      }
      renderRelationRows();
    }

    function relationRowsForView() {
      const rows = Array.isArray(state.matchings.rows) ? state.matchings.rows : [];
      if (state.relationsView === "to-launch") {
        return rows.filter((row) => row.workflow_status === "accepte_employeur");
      }
      if (state.relationsView === "in-progress") {
        return rows.filter((row) => row.workflow_status === "mise_en_relation_faite");
      }
      return rows;
    }

    function relationActionBox(row) {
      if (state.relationsView === "to-launch") {
        if (row.employer_whatsapp_consent === "yes") {
          return {
            title: "Action attendue : créer le groupe WhatsApp",
            text: "L’employeur a accepté WhatsApp. Prépare le groupe, copie le message d’ouverture, puis marque la mise en relation comme faite."
          };
        }
        if (row.employer_whatsapp_consent === "no") {
          return {
            title: "Action attendue : traiter hors WhatsApp",
            text: "L’employeur est intéressé sans WhatsApp. Lance le contact par email ou téléphone, puis marque la mise en relation comme faite."
          };
        }
        return {
          title: "Action attendue : choisir le canal",
          text: "L’employeur a accepté le candidat mais n’a pas répondu sur WhatsApp. Décide si tu relances WhatsApp ou si tu traites hors WhatsApp."
        };
      }
      if (state.relationsView === "in-progress") {
        return {
          title: "Action attendue : suivre puis renseigner l’issue",
          text: "Surveille l’échange. Dès qu’un résultat est connu, renseigne-le pour comparer les parcours WhatsApp et hors WhatsApp."
        };
      }
      return {
        title: "Aucune action attendue",
        text: "Cette carte est conservée pour historique."
      };
    }

    function renderRelationRows() {
      const list = document.getElementById("relations-list");
      if (!list) return;
      const search = normalizeText(state.relationsSearch || "");
      const rows = relationRowsForView().filter((row) => {
        if (!search) return true;
        return normalizeText([
          row.candidat?.nom,
          row.candidat?.email,
          row.employeur?.employeur,
          row.employeur?.poste,
          row.employeur?.contact,
          row.employeur?.pays,
          relationChannel(row),
          relationResultLabel(row.relation_result),
          workflowStatusLabel(row.workflow_status),
          employerResponseLabel(row.employer_response),
        ].join(" ")).includes(search);
      });
      document.getElementById("relations-status-line").textContent = `${rows.length} mise(s) en relation affichée(s).`;
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state">Aucune mise en relation ne correspond à cette vue.</div>`;
        return;
      }
      list.innerHTML = rows.map((row) => {
        const action = relationActionBox(row);
        const whatsappMessage = `Bonjour, je crée ce groupe pour faciliter la mise en relation entre ${row.candidat?.nom || "le candidat"} et ${row.employeur?.employeur || "l’employeur"} dans le cadre de Match Europe.`;
        const canMarkRelationDone = ["to-launch"].includes(state.relationsView);
        const canSetResult = ["in-progress"].includes(state.relationsView);
        return `
          <details class="relation-compact-card" data-record-id="${esc(row.record_id)}">
            <summary>
              <span class="relation-main">
                <strong>${esc(row.candidat?.nom || "Candidat")} · ${esc(row.employeur?.employeur || "Employeur")}</strong>
                <span>${esc(row.employeur?.poste || "-")} · ${esc(row.employeur?.pays || "-")}</span>
              </span>
              <span class="relation-compact-meta">Canal : ${esc(relationChannel(row))}</span>
              <span class="relation-compact-meta">Résultat : ${esc(relationResultLabel(row.relation_result))}</span>
              <span class="relation-compact-meta">${esc(employerResponseLabel(row.employer_response))}</span>
              <span class="relation-score">${esc(row.score ?? "-")}/100</span>
            </summary>
            <div class="relation-detail">
              <div class="summary-tags" style="margin-bottom:0.8rem;">
                <span class="pill">Workflow : ${esc(workflowStatusLabel(row.workflow_status))}</span>
                ${employerWhatsappBadge(row)}
                <span class="pill">Employeur : ${esc(employerResponseLabel(row.employer_response))}</span>
              </div>
              <section class="next-action-box">
                <strong>${esc(action.title)}</strong>
                <p>${esc(action.text)}</p>
              </section>
              <div class="compare-grid" style="margin-top:0.8rem;">
                <section class="compare-card">
                  <h3>Contact</h3>
                  <dl class="detail-list">
                    <div class="detail-row"><dt>Candidat</dt><dd>${esc(row.candidat?.nom || "-")} · ${esc(row.candidat?.email || "-")}</dd></div>
                    <div class="detail-row"><dt>Employeur</dt><dd>${esc(row.employeur?.contact || row.employeur?.employeur || "-")}</dd></div>
                    <div class="detail-row"><dt>Téléphone employeur</dt><dd>${esc(row.employer_whatsapp_phone || row.employeur?.telephone || "-")}</dd></div>
                    <div class="detail-row"><dt>Mise en relation</dt><dd>${esc(row.mise_en_relation_at || "-")}</dd></div>
                    <div class="detail-row"><dt>Résultat</dt><dd>${esc(relationResultLabel(row.relation_result))}${row.relation_result_at ? ` · ${esc(row.relation_result_at)}` : ""}</dd></div>
                  </dl>
                </section>
                <section class="compare-card">
                  <h3>Message WhatsApp à copier</h3>
                  <p class="microcopy">${esc(whatsappMessage)}</p>
                </section>
              </div>
              <section class="notes-box" style="margin-top:1rem;">
                <h4>Note interne</h4>
                <div class="form-grid">
                  <label class="field">
                    <span>Canal réel utilisé</span>
                    <select id="relation-channel-${esc(row.record_id)}">
                      ${relationChannelOptions(row)}
                    </select>
                  </label>
                  <label class="field">
                    <span>Résultat</span>
                    <select id="relation-result-${esc(row.record_id)}">
                      ${relationResultOptions(row.relation_result || "")}
                    </select>
                  </label>
                </div>
                <textarea id="relation-note-${esc(row.record_id)}" placeholder="Optionnel. Note interne conservée dans l’admin.">${esc(row.admin_decision_note || "")}</textarea>
                <textarea id="relation-result-note-${esc(row.record_id)}" placeholder="Optionnel. Précision sur le résultat.">${esc(row.relation_result_note || "")}</textarea>
                <div class="hero-actions">
                  ${canMarkRelationDone ? `<button class="btn-neutral" type="button" data-relation-workflow="mise_en_relation_faite">Mise en relation faite</button>` : ""}
                  ${canSetResult ? `<button class="btn-neutral" type="button" data-relation-result-action>Enregistrer le résultat</button>` : ""}
                </div>
              </section>
            </div>
          </details>
        `;
      }).join("");
      for (const button of list.querySelectorAll("[data-relation-workflow]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest("[data-record-id]");
          const recordId = card?.dataset.recordId;
          const workflowStatus = event.currentTarget.dataset.relationWorkflow;
          const relationChannelValue = document.getElementById(`relation-channel-${recordId}`)?.value || "";
          const note = document.getElementById(`relation-note-${recordId}`)?.value || "";
          if (!recordId || !workflowStatus) return;
          await submitRelationWorkflow(recordId, workflowStatus, note, { relation_channel: relationChannelValue });
        });
      }
      for (const button of list.querySelectorAll("[data-relation-result-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest("[data-record-id]");
          const recordId = card?.dataset.recordId;
          const relationChannelValue = document.getElementById(`relation-channel-${recordId}`)?.value || "";
          const relationResultValue = document.getElementById(`relation-result-${recordId}`)?.value || "";
          const note = document.getElementById(`relation-note-${recordId}`)?.value || "";
          const relationResultNote = document.getElementById(`relation-result-note-${recordId}`)?.value || "";
          if (!recordId || !relationResultValue) {
            setStatus("relations-status-line", "Erreur : sélectionnez un résultat.");
            return;
          }
          await submitRelationWorkflow(recordId, "mise_en_relation_faite", note, {
            relation_channel: relationChannelValue,
            relation_result: relationResultValue,
            relation_result_note: relationResultNote,
          });
        });
      }
    }

    async function loadRelations() {
      document.getElementById("filter-status").value = "all";
      document.getElementById("filter-source").value = "all";
      await loadMatchings();
      renderRelationRows();
    }

    async function submitRelationWorkflow(recordId, workflowStatus, note, extraPayload = {}) {
      setStatus("relations-status-line", "Mise à jour de la mise en relation...");
      await submitWorkflow(recordId, workflowStatus, note, extraPayload);
      setStatus("relations-status-line", "Mise en relation mise à jour.");
      await loadRelations();
    }

    function workflowStatusLabel(status) {
      if (status === "calcule") return "calculé";
      if (status === "a_valider_admin") return "à valider";
      if (status === "refuse_admin") return "refus admin";
      if (status === "valide_admin") return "validé admin";
      if (status === "envoye_employeur") return "envoyé employeur";
      if (status === "accepte_employeur") return "accepté employeur";
      if (status === "refuse_employeur") return "refusé employeur";
      if (status === "mise_en_relation_faite") return "mise en relation faite";
      if (status === "embauche_confirmee") return "embauche confirmée";
      if (status === "relation_terminee") return "relation terminée";
      return status || "inconnu";
    }

    function noMatchStatusLabel(status) {
      if (status === "pending") return "à traiter";
      if (status === "sent") return "email envoyé";
      if (status === "dismissed") return "ignoré";
      return status || "inconnu";
    }

    function newJobStatusLabel(status) {
      if (status === "pending") return "à traiter";
      if (status === "processed") return "traité";
      if (status === "dismissed") return "ignoré";
      return status || "inconnu";
    }

    function taskStatusLabel(status) {
      if (status === "pending") return "à traiter";
      if (status === "done") return "traité";
      if (status === "dismissed") return "ignoré";
      return status || "inconnu";
    }

    function taskTypeLabel(type) {
      if (type === "matching_review") return "Matching";
      if (type === "no_match_followup") return "Sans matching";
      if (type === "new_job_request") return "Nouveau métier";
      if (type === "new_employer_alert") return "Nouvel employeur";
      if (type === "duplicate_invitation_followup") return "Invitation en doublon";
      return type || "Tâche";
    }

    function duplicateFollowupLabel(status) {
      if (status === "pending") return "relance à arbitrer";
      if (status === "reminded") return "relance envoyée";
      if (status === "ignored") return "ignoré";
      return status || "inconnu";
    }

    function normalizeText(value) {
      return String(value || "").toLowerCase();
    }

    function matchesSearch(row, search) {
      if (!search) return true;
      const haystack = [
        row.candidat?.nom,
        row.candidat?.email,
        row.candidat?.metier,
        row.employeur?.employeur,
        row.employeur?.contact,
        row.employeur?.poste,
        row.employeur?.pays,
        row.besoin_id,
        row.candidat_id,
      ].map(normalizeText).join(" ");
      return haystack.includes(search);
    }

    function noMatchSearch(row, search) {
      if (!search) return true;
      const payload = row.payload || {};
      const haystack = [
        row.role,
        row.title,
        row.subtitle,
        row.recipient_email,
        payload.nom,
        payload.email,
        payload.metier,
        payload.employeur,
        payload.contact,
        payload.poste,
        payload.pays,
      ].map(normalizeText).join(" ");
      return haystack.includes(search);
    }

    function newJobSearch(row, search) {
      if (!search) return true;
      const haystack = [
        row.employeur,
        row.contact,
        row.email,
        row.poste,
        row.pays,
        row.requested_jobs,
      ].map(normalizeText).join(" ");
      return haystack.includes(search);
    }

    function taskMatchesSearch(row, search) {
      if (!search) return true;
      const matching = row.matching || {};
      const noMatch = row.no_match || {};
      const newJob = row.new_job || {};
      const newEmployer = row.new_employer || {};
      const haystack = [
        row.task_type,
        taskTypeLabel(row.task_type),
        row.title,
        row.subtitle,
        row.summary,
        matching?.candidat?.nom,
        matching?.candidat?.email,
        matching?.employeur?.employeur,
        matching?.employeur?.poste,
        noMatch?.recipient_email,
        newJob?.email,
        newJob?.requested_jobs,
        newEmployer?.employeur,
        newEmployer?.contact,
        newEmployer?.email,
        newEmployer?.sponsor_company_name,
        newEmployer?.sponsor_email,
        newEmployer?.source_invitation_scope,
      ].map(normalizeText).join(" ");
      return haystack.includes(search);
    }

    function bulletList(items, emptyLabel) {
      if (!Array.isArray(items) || items.length === 0) {
        return `<ul><li>${esc(emptyLabel)}</li></ul>`;
      }
      return `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
    }

    function invitationStatusLabel(status) {
      if (status === "invitation_a_envoyer") return "à envoyer";
      if (status === "traitee") return "traitée";
      if (status === "invitation_envoyee") return "envoyée";
      if (status === "questionnaire_recu") return "questionnaire reçu";
      if (status === "rapprochee") return "rapprochée";
      if (status === "erreur_envoi") return "erreur d’envoi";
      return status || "inconnu";
    }

    function invitationStatusClass(status) {
      if (status === "invitation_envoyee") return "sent";
      if (status === "questionnaire_recu" || status === "rapprochee") return "received";
      if (status === "erreur_envoi") return "error";
      return "pending";
    }

    function isManualFtInvitation(row) {
      const source = String(row?.source || "").trim().toLowerCase();
      const sentBy = String(row?.sent_by || "").trim().toLowerCase();
      return ["ft_manual_email", "france_travail_manual_email"].includes(source)
        || ["admin_ft_email_manual", "france_travail_email_manual"].includes(sentBy);
    }

    function invitationDeliveryLabel(row) {
      if (row?.invitation_status === "invitation_envoyee" && isManualFtInvitation(row)) {
        return "envoyée depuis FT";
      }
      return invitationStatusLabel(row?.invitation_status);
    }

    function invitationDeliveryChannel(row) {
      if (isManualFtInvitation(row)) return "Adresse France Travail (manuel)";
      if (row?.brevo_message_id) return "Brevo";
      return "-";
    }

    function updateInvitationKpis(stats = {}) {
      document.getElementById("invite-kpi-total").textContent = stats.total ?? 0;
      document.getElementById("invite-kpi-pending").textContent = stats.invitation_a_envoyer ?? 0;
      document.getElementById("invite-kpi-sent").textContent = stats.invitation_envoyee ?? 0;
      document.getElementById("invite-kpi-received").textContent = stats.questionnaire_recu ?? 0;
      document.getElementById("invite-kpi-reminder").textContent = stats.reminder_due ?? 0;
    }

    function pendingInvitationRows() {
      return state.invitations.rows.filter((row) =>
        row.invitation_status === "invitation_a_envoyer" && row.duplicate_followup_status !== "pending"
      );
    }

    function reminderInvitationRows() {
      return state.invitations.rows.filter((row) => row.needs_reminder);
    }

    function updatePendingSendPanel() {
      const pendingRows = pendingInvitationRows();
      const count = pendingRows.length;
      document.getElementById("pending-send-count").textContent = count;
      document.getElementById("pending-send-label").textContent = count > 1
        ? "invitations à envoyer"
        : "invitation à envoyer";
      document.getElementById("send-pending-btn").disabled = count === 0;
      document.getElementById("toggle-selection-btn").disabled = count === 0;

      const panel = document.getElementById("selection-panel");
      const list = document.getElementById("selection-list");
      panel.hidden = !state.invitations.selectionMode || count === 0;
      if (!state.invitations.selectionMode || count === 0) {
        list.innerHTML = "";
        return;
      }

      list.innerHTML = pendingRows.map((row) => {
        const name = row.role === "employer"
          ? (row.company_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Employeur")
          : ([row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Candidat");
        const type = row.role === "employer" ? "Employeur" : "Candidat";
        const checked = state.invitations.selectedIds.includes(Number(row.record_id)) ? "checked" : "";
        return `
          <label class="selection-row">
            <input type="checkbox" value="${esc(row.record_id)}" ${checked}>
            <span class="selection-main">
              <strong>${esc(name)}</strong>
              <span>${esc(type)} · ${esc(row.email || "-")}</span>
            </span>
          </label>
        `;
      }).join("");

      for (const input of list.querySelectorAll('input[type="checkbox"]')) {
        input.addEventListener("change", (event) => {
          const recordId = Number(event.currentTarget.value || 0);
          if (!recordId) return;
          if (event.currentTarget.checked) {
            if (!state.invitations.selectedIds.includes(recordId)) {
              state.invitations.selectedIds.push(recordId);
            }
          } else {
            state.invitations.selectedIds = state.invitations.selectedIds.filter((value) => value !== recordId);
          }
          document.getElementById("send-selected-btn").disabled = state.invitations.selectedIds.length === 0;
        });
      }

      document.getElementById("send-selected-btn").disabled = state.invitations.selectedIds.length === 0;
    }

    function updateReminderPanel() {
      const reminderRows = reminderInvitationRows();
      const count = reminderRows.length;
      document.getElementById("reminder-send-count").textContent = count;
      document.getElementById("reminder-send-label").textContent = count > 1
        ? "invitations à relancer"
        : "invitation à relancer";
      document.getElementById("send-reminders-btn").disabled = count === 0;
    }

    function renderInvitations() {
      const list = document.getElementById("invitation-list");
      const search = normalizeText(document.getElementById("invite-filter-search").value.trim());
      const statusFilter = document.getElementById("invite-filter-status").value;
      const filtered = state.invitations.rows.filter((row) => {
        if (state.invitations.view === "errors") {
          const isError = row.invitation_status === "erreur_envoi";
          const isDuplicate = row.duplicate_followup_status === "pending";
          if (!isError && !isDuplicate) return false;
        } else {
        if (statusFilter === "duplicate_followup_pending") {
          return row.duplicate_followup_status === "pending";
        }
        if (statusFilter === "reminder_due" && !row.needs_reminder) {
          return false;
        }
        if (statusFilter === "invitation_a_envoyer") {
          if (row.invitation_status !== "invitation_a_envoyer" || row.duplicate_followup_status === "pending") {
            return false;
          }
        }
        if (statusFilter !== "all" && statusFilter !== "reminder_due" && statusFilter !== "duplicate_followup_pending" && row.invitation_status !== statusFilter) {
          return false;
        }
        }
        if (!search) return true;
        const haystack = [
          row.email,
          row.first_name,
          row.last_name,
          row.company_name,
          row.external_ref,
          row.source,
          row.sent_by,
          invitationDeliveryChannel(row),
          Array.isArray(row.target_job_labels) ? row.target_job_labels.join(" ") : "",
          row.notes,
        ].map(normalizeText).join(" ");
        return haystack.includes(search);
      });

      if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Aucune invitation ne correspond aux filtres actuels.</div>`;
        return;
      }

      list.innerHTML = filtered.map((row) => {
        const title = row.role === "employer"
          ? (row.company_name || row.email || "Employeur")
          : ([row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Candidat");
        const subtitleBits = [
          row.role === "employer" ? "Employeur" : "Candidat",
          row.language ? row.language.toUpperCase() : "",
          row.email || "",
        ].filter(Boolean);
        return `
          <article class="invitation-card" data-record-id="${esc(row.record_id)}">
            <div class="invitation-head">
              <div>
                <h3>${esc(title)}</h3>
                <p>${esc(subtitleBits.join(" · "))}</p>
              </div>
              <div class="summary-tags">
                <span class="pill ${invitationStatusClass(row.invitation_status)}">${esc(invitationDeliveryLabel(row))}</span>
                ${row.duplicate_followup_status ? `<span class="pill">${esc(duplicateFollowupLabel(row.duplicate_followup_status))}</span>` : ""}
              </div>
            </div>
            <div class="invitation-meta">
              <div class="meta-box">
                <strong>Canal</strong>
                <span>${esc(invitationDeliveryChannel(row))}</span>
              </div>
              <div class="meta-box">
                <strong>Source</strong>
                <span>${esc(row.source || "-")}</span>
              </div>
              <div class="meta-box">
                <strong>Référence</strong>
                <span>${esc(row.external_ref || "-")}</span>
              </div>
              <div class="meta-box">
                <strong>Envoyée le</strong>
                <span>${esc(row.sent_at || "-")}</span>
              </div>
              <div class="meta-box">
                <strong>Questionnaire reçu</strong>
                <span>${esc(row.answered_at || "-")}</span>
              </div>
              <div class="meta-box">
                <strong>Jours depuis envoi</strong>
                <span>${esc(row.days_since_sent ?? "-")}</span>
              </div>
              <div class="meta-box">
                <strong>Relances</strong>
                <span>${esc(row.reminder_count ?? 0)}</span>
              </div>
              <div class="meta-box">
                <strong>Dernière relance</strong>
                <span>${esc(row.last_reminder_at || "-")}</span>
              </div>
              <div class="meta-box">
                <strong>Record lié</strong>
                <span>${esc(row.linked_record_key || row.linked_record_id || "-")}</span>
              </div>
              <div class="meta-box">
                <strong>Matching</strong>
                <span>${esc(row.matching_status || "-")}</span>
              </div>
              ${row.role === "candidate" ? `
                <div class="meta-box">
                  <strong>Campagne</strong>
                  <span>${esc(row.campaign_type === "eures_cv_deposit" ? "CV déposé sur EURES" : "Générique / métier ciblé")}</span>
                </div>
                <div class="meta-box">
                  <strong>Métiers ciblés</strong>
                  <span>${esc((row.target_job_labels || []).join(" · ") || "-")}</span>
                </div>
              ` : ""}
            </div>
            ${row.duplicate_followup_status === "pending" ? `
              <section class="notes-box" style="margin-top:0.9rem;">
                <h4>Arbitrage doublon</h4>
                <p style="margin:0 0 0.8rem; line-height:1.7;">${esc(row.duplicate_followup_message || "Cette adresse existe déjà dans le suivi.")}</p>
                <div class="compare-grid">
                  <section class="compare-card">
                    <h3>Invitation actuelle</h3>
                    <dl class="detail-list">
                      <div class="detail-row"><dt>Adresse</dt><dd>${esc(row.email || "-")}</dd></div>
                      <div class="detail-row"><dt>Type</dt><dd>${esc(row.role === "employer" ? "Employeur" : "Candidat")}</dd></div>
                      <div class="detail-row"><dt>Référence</dt><dd>${esc(row.external_ref || "-")}</dd></div>
                    </dl>
                  </section>
                  <section class="compare-card">
                    <h3>Conflit détecté</h3>
                    <dl class="detail-list">
                      <div class="detail-row"><dt>Nature</dt><dd>${esc(row.duplicate_followup_type === "existing_questionnaire" ? "Questionnaire déjà reçu" : "Invitation déjà envoyée")}</dd></div>
                      <div class="detail-row"><dt>Record cible</dt><dd>${esc(row.duplicate_followup_target_record_id || "-")}</dd></div>
                      <div class="detail-row"><dt>Statut cible</dt><dd>${esc(invitationStatusLabel(row.duplicate_followup_target_status || "-"))}</dd></div>
                    </dl>
                  </section>
                </div>
                <textarea id="duplicate-followup-note-${esc(row.record_id)}" placeholder="Note interne optionnelle">${esc(row.duplicate_followup_note || "")}</textarea>
                <div class="hero-actions">
                  ${row.duplicate_followup_type === "existing_invitation" && row.duplicate_followup_target_status === "invitation_envoyee" ? `<button type="button" data-duplicate-followup-action="remind" data-record-id="${esc(row.record_id)}">Envoyer la relance</button>` : ""}
                  <button class="btn-refuse" type="button" data-delete-invitation="${esc(row.record_id)}" data-delete-kind="duplicate">Supprimer le doublon</button>
                  <button class="btn-refuse" type="button" data-duplicate-followup-action="ignore" data-record-id="${esc(row.record_id)}">Ignorer</button>
                </div>
              </section>
            ` : ""}
            ${row.invitation_status === "erreur_envoi" ? `
              <div class="inline-actions" style="margin-top:0.9rem;">
                <button class="btn-refuse" type="button" data-delete-invitation="${esc(row.record_id)}">Supprimer cette erreur</button>
              </div>
            ` : ""}
            ${row.invitation_status === "invitation_envoyee" && !row.answered_at && row.duplicate_followup_status !== "pending" && !isManualFtInvitation(row) ? `
              <div class="inline-actions" style="margin-top:0.9rem;">
                <button type="button" data-remind-invitation="${esc(row.record_id)}">${row.needs_reminder ? "Relancer maintenant" : "Envoyer une relance"}</button>
              </div>
            ` : ""}
            ${row.invite_link ? `<pre class="code-block">${esc(row.invite_link)}</pre>` : ""}
          </article>
        `;
      }).join("");

      for (const button of list.querySelectorAll("[data-delete-invitation]")) {
        button.addEventListener("click", async (event) => {
          const recordId = event.currentTarget.dataset.deleteInvitation;
          const kind = event.currentTarget.dataset.deleteKind || "error";
          if (!recordId) return;
          const confirmed = window.confirm(kind === "duplicate"
            ? "Supprimer définitivement cette invitation doublon ? L’invitation ou le questionnaire déjà existant sera conservé."
            : "Supprimer définitivement cette invitation en erreur d’envoi ?"
          );
          if (!confirmed) return;
          await deleteInvitationError(recordId, kind);
        });
      }
      for (const button of list.querySelectorAll("[data-remind-invitation]")) {
        button.addEventListener("click", async (event) => {
          const recordId = Number(event.currentTarget.dataset.remindInvitation || 0);
          if (!recordId) return;
          await sendInvitationReminders([recordId]);
        });
      }
      for (const button of list.querySelectorAll("[data-duplicate-followup-action]")) {
        button.addEventListener("click", async (event) => {
          const recordId = Number(event.currentTarget.dataset.recordId || 0);
          const action = event.currentTarget.dataset.duplicateFollowupAction || "";
          const note = document.getElementById(`duplicate-followup-note-${recordId}`)?.value || "";
          if (!recordId || !action) return;
          await submitDuplicateFollowup(recordId, action, note);
        });
      }
      updatePendingSendPanel();
      updateReminderPanel();
    }

    function questionnaireResponseMatchesSearch(row, search) {
      if (!search) return true;
      const haystack = [
        row.title,
        row.subtitle,
        row.summary,
        row.record_key,
        ...(Array.isArray(row.fields) ? row.fields.flatMap((field) => [field.label, field.value]) : []),
      ].map(normalizeText).join(" ");
      return haystack.includes(search);
    }

    function optionLabelForCandidate(row) {
      const parts = [row.title, row.subtitle, row.summary].filter(Boolean);
      return parts.join(" · ") || row.record_key || "Candidat";
    }

    function optionLabelForEmployer(row) {
      const parts = [row.title, row.subtitle, row.summary].filter(Boolean);
      return parts.join(" · ") || row.record_key || "Employeur";
    }

    function renderManualMatchingOptions() {
      const candidateSelect = document.getElementById("manual-match-candidate");
      const spontaneousCandidateSelect = document.getElementById("spontaneous-candidate");
      const employerSelect = document.getElementById("manual-match-employer");
      const currentCandidate = candidateSelect.value;
      const currentEmployer = employerSelect.value;
      const activeCandidateRows = state.candidateResponses.rows.filter((row) => row.is_active !== false);
      const activeEmployerRows = state.employerResponses.rows.filter((row) => row.is_active !== false);

      candidateSelect.innerHTML = `<option value="">Sélectionner un candidat</option>` + activeCandidateRows.map((row) => `
        <option value="${esc(row.record_id)}">${esc(optionLabelForCandidate(row))}</option>
      `).join("");
      spontaneousCandidateSelect.innerHTML = `<option value="">Sélectionner un candidat</option>` + activeCandidateRows.map((row) => `
        <option value="${esc(row.record_id)}">${esc(optionLabelForCandidate(row))}</option>
      `).join("");
      employerSelect.innerHTML = `<option value="">Sélectionner un besoin employeur</option>` + activeEmployerRows.map((row) => `
        <option value="${esc(row.record_id)}">${esc(optionLabelForEmployer(row))}</option>
      `).join("");

      if (activeCandidateRows.some((row) => String(row.record_id) === currentCandidate)) {
        candidateSelect.value = currentCandidate;
      }
      if (activeEmployerRows.some((row) => String(row.record_id) === currentEmployer)) {
        employerSelect.value = currentEmployer;
      }
      renderManualMatchingPreview();
    }

    function renderQuestionnairePreviewFields(fields, limit = 999) {
      const rows = Array.isArray(fields) ? fields.slice(0, limit) : [];
      if (!rows.length) {
        return `<div class="detail-row"><dt>Aperçu</dt><dd>Aucune donnée disponible</dd></div>`;
      }
      return rows.map((field) => `
        <div class="detail-row">
          <dt>${esc(field.label || field.key || "-")}</dt>
          <dd>${esc(field.value || "-")}</dd>
        </div>
      `).join("");
    }

    function renderManualMatchingPreview() {
      const candidateRecordId = String(document.getElementById("manual-match-candidate").value || "");
      const employerRecordId = String(document.getElementById("manual-match-employer").value || "");
      const preview = document.getElementById("manual-match-preview");
      const candidateTarget = document.getElementById("manual-match-candidate-preview");
      const employerTarget = document.getElementById("manual-match-employer-preview");
      const candidateRow = state.candidateResponses.rows.find((row) => String(row.record_id) === candidateRecordId);
      const employerRow = state.employerResponses.rows.find((row) => String(row.record_id) === employerRecordId);

      if (!candidateRow && !employerRow) {
        preview.hidden = true;
        candidateTarget.innerHTML = "";
        employerTarget.innerHTML = "";
        return;
      }

      preview.hidden = false;
      candidateTarget.innerHTML = candidateRow
        ? renderQuestionnairePreviewFields(candidateRow.fields)
        : `<div class="detail-row"><dt>Sélection</dt><dd>Aucun candidat sélectionné</dd></div>`;
      employerTarget.innerHTML = employerRow
        ? renderQuestionnairePreviewFields(employerRow.fields)
        : `<div class="detail-row"><dt>Sélection</dt><dd>Aucun besoin employeur sélectionné</dd></div>`;
    }

    function renderQuestionnaireResponses(role) {
      const isCandidate = role === "candidate";
      const stateKey = isCandidate ? "candidateResponses" : "employerResponses";
      const listId = isCandidate ? "candidate-response-list" : "employer-response-list";
      const searchId = isCandidate ? "candidate-response-filter-search" : "employer-response-filter-search";
      const list = document.getElementById(listId);
      const search = normalizeText(document.getElementById(searchId).value.trim());
      const filtered = state[stateKey].rows.filter((row) => questionnaireResponseMatchesSearch(row, search));

      if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Aucune réponse ne correspond aux filtres actuels.</div>`;
        return;
      }

      list.innerHTML = filtered.map((row) => `
        <article class="matching-card" data-role="${esc(role)}">
          <div class="matching-summary">
            <div>
              <h2>${esc(row.title || (isCandidate ? "Candidat" : "Employeur"))}</h2>
              <p>${esc(row.subtitle || (isCandidate ? "Réponse candidat" : "Réponse employeur"))}</p>
              <div class="summary-tags">
                <span class="pill ${isCandidate ? "role-candidate" : "role-employer"}">${esc(isCandidate ? "Candidat" : "Employeur")}</span>
                <span class="pill ${row.is_active === false ? "refused" : "accepted"}">${esc(row.is_active === false ? "Archivée" : "Active")}</span>
                <span class="pill">Réponse reçue le : ${esc(row.response_received_at || row.submitted_at || "-")}</span>
                <span class="pill">Clé : ${esc(row.record_key || row.record_id || "-")}</span>
                <span class="pill">${esc(row.matching_count || 0)} matching(s)</span>
                ${row.cv_download_url ? `<span class="pill accepted">CV disponible</span>` : ""}
              </div>
              ${row.summary ? `<div class="detail-tags"><span class="pill">${esc(row.summary)}</span></div>` : ""}
            </div>
            <div class="summary-score">
              <div class="score-box">
                <strong>${esc(Array.isArray(row.fields) ? row.fields.length : 0)}</strong>
                <span>champs non vides</span>
              </div>
            </div>
          </div>

          <div class="matching-body">
            <section class="compare-card" style="grid-column: 1 / -1;">
              <section class="notes-box" style="margin-bottom:1rem;">
                <h4>${esc(isCandidate ? "Matchings avec des employeurs" : "Matchings avec des candidats")}</h4>
                ${Array.isArray(row.matchings) && row.matchings.length ? `
                  <div class="detail-list">
                    ${row.matchings.map((matching) => `
                      <div class="detail-row" style="grid-template-columns:minmax(0, 1fr) auto; align-items:center;">
                        <div>
                          <strong>${esc(matching.counterpart_name || "-")}</strong>
                          <div style="color:var(--muted); margin-top:0.2rem;">${esc(matching.counterpart_subtitle || "-")}</div>
                          <div class="summary-tags" style="margin-top:0.45rem;">
                            <span class="pill">Score : ${esc(matching.score ?? 0)}</span>
                            <span class="pill">${esc(matching.workflow_status || "-")}</span>
                          </div>
                        </div>
                        <button class="btn-neutral" type="button" data-open-matching="${esc(matching.matching_record_id)}">Voir le matching</button>
                      </div>
                    `).join("")}
                  </div>
                ` : `<p style="margin:0; color:var(--muted);">Aucun matching lié pour le moment.</p>`}
              </section>
              ${row.cv_download_url ? `
                <section class="notes-box" style="margin-bottom:1rem;">
                  <h4>CV du candidat</h4>
                  <p style="margin:0; color:var(--muted); line-height:1.7;">${esc(row.cv_file_name || "CV")}</p>
                  <div class="hero-actions" style="margin-top:0.8rem;">
                    <a class="btn-neutral" href="${esc(row.cv_download_url)}" target="_blank" rel="noopener noreferrer">Télécharger le CV</a>
                  </div>
                </section>
              ` : ""}
              ${row.response_disabled_reason ? `<p style="margin:0 0 0.8rem; line-height:1.7;"><strong>Motif d’archivage :</strong> ${esc(row.response_disabled_reason)}</p>` : ""}
              <details>
                <summary style="cursor:pointer; font-weight:700; margin-bottom:0.9rem;">
                  ${esc(isCandidate ? "Afficher la réponse complète du candidat" : "Afficher la réponse complète de l’employeur")}
                </summary>
                <dl class="detail-list">
                  ${(Array.isArray(row.fields) ? row.fields : []).map((field) => `
                    <div class="detail-row">
                      <dt>${esc(field.label || field.key || "-")}</dt>
                      <dd>${esc(field.value || "-")}</dd>
                    </div>
                  `).join("")}
                </dl>
              </details>
              <section class="notes-box" style="margin-top:1rem;">
                <h4>Gestion de la réponse</h4>
                <p style="margin:0 0 0.8rem; color:var(--muted); line-height:1.7;">
                  Archiver retire cette réponse des nouveaux matchings, sans la supprimer de l’historique.
                </p>
                <div class="compact-response-actions">
                  <input id="response-note-${esc(role)}-${esc(row.record_id)}" type="text" placeholder="Motif d’archivage optionnel" value="${esc(row.response_disabled_reason || "")}">
                  <div class="hero-actions">
                    ${row.is_active === false
                      ? `<button type="button" data-response-status-action="active" data-role="${esc(role)}" data-record-id="${esc(row.record_id)}">Réactiver</button>`
                      : `<button class="btn-refuse" type="button" data-response-status-action="disabled" data-role="${esc(role)}" data-record-id="${esc(row.record_id)}">Archiver</button>`
                    }
                    <button class="btn-refuse" type="button" data-response-delete="${esc(row.record_id)}" data-role="${esc(role)}">Supprimer</button>
                  </div>
                </div>
              </section>
            </section>
          </div>
        </article>
      `).join("");

      for (const button of list.querySelectorAll("[data-response-status-action]")) {
        button.addEventListener("click", async (event) => {
          const recordId = Number(event.currentTarget.dataset.recordId || 0);
          const roleValue = event.currentTarget.dataset.role || "";
          const status = event.currentTarget.dataset.responseStatusAction || "";
          const note = document.getElementById(`response-note-${roleValue}-${recordId}`)?.value || "";
          if (!recordId || !roleValue || !status) return;
          await updateQuestionnaireResponseStatus(roleValue, recordId, status, note);
        });
      }
      for (const button of list.querySelectorAll("[data-response-delete]")) {
        button.addEventListener("click", async (event) => {
          const recordId = Number(event.currentTarget.dataset.responseDelete || 0);
          const roleValue = event.currentTarget.dataset.role || "";
          if (!recordId || !roleValue) return;
          const confirmed = window.confirm("Supprimer définitivement cette réponse et les matchings associés ?");
          if (!confirmed) return;
          await deleteQuestionnaireResponse(roleValue, recordId);
        });
      }
      for (const button of list.querySelectorAll("[data-open-matching]")) {
        button.addEventListener("click", async (event) => {
          const matchingRecordId = Number(event.currentTarget.dataset.openMatching || 0);
          if (!matchingRecordId) return;
          await openMatchingRecord(matchingRecordId);
        });
      }
    }

    async function loadQuestionnaireResponses(role, options = {}) {
      const isCandidate = role === "candidate";
      const stateKey = isCandidate ? "candidateResponses" : "employerResponses";
      const statusId = isCandidate ? "candidate-response-status-line" : "employer-response-status-line";
      const listId = isCandidate ? "candidate-response-list" : "employer-response-list";
      const kpiId = isCandidate ? "candidate-response-kpi-total" : "employer-response-kpi-total";
      const kpiActiveId = isCandidate ? "candidate-response-kpi-active" : "employer-response-kpi-active";
      const kpiDisabledId = isCandidate ? "candidate-response-kpi-disabled" : "employer-response-kpi-disabled";
      const label = isCandidate ? "candidats" : "employeurs";
      const silent = Boolean(options.silent);
      const shouldClearUnseen = Boolean(options.clearUnseen);

      if (state[stateKey].loading) return;
      state[stateKey].loading = true;
      if (!silent) {
        setStatus(statusId, `Chargement des réponses ${label}...`);
      }

      try {
        const response = await fetch(apiUrl(`/admin/questionnaires/${role}`), { credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
        const previousSignature = state[stateKey].signature || "";
        const nextSignature = questionnaireResponseSignature(nextRows);
        const previousCount = Array.isArray(state[stateKey].rows) ? state[stateKey].rows.length : 0;
        const nextCount = nextRows.length;
        const hasChanged = previousSignature !== nextSignature;
        const initialized = Boolean(state[stateKey].initialized);

        state[stateKey].rows = nextRows;
        state[stateKey].signature = nextSignature;
        state[stateKey].initialized = true;
        document.getElementById(kpiId).textContent = payload.stats?.total ?? 0;
        document.getElementById(kpiActiveId).textContent = payload.stats?.active ?? 0;
        document.getElementById(kpiDisabledId).textContent = payload.stats?.disabled ?? 0;
        if (shouldClearUnseen) {
          state[stateKey].unseenCount = 0;
        } else if (silent && initialized && hasChanged && nextCount > previousCount) {
          state[stateKey].unseenCount += nextCount - previousCount;
        }
        if (!silent || hasChanged) {
          renderQuestionnaireResponses(role);
          renderDataHistoryView();
          renderManualMatchingOptions();
        }
        renderGlobalResponseWatch();
        if (!silent) {
          setStatus(statusId, `${state[stateKey].rows.length} réponse(s) ${label} chargée(s).`);
        } else if (hasChanged && nextCount > previousCount) {
          setStatus(statusId, `${nextCount - previousCount} nouvelle(s) réponse(s) ${label} détectée(s).`);
        }
      } catch (error) {
        if (!silent) {
          document.getElementById(listId).innerHTML = `<div class="empty-state">${esc(error.message || "Erreur de chargement")}</div>`;
          setStatus(statusId, `Erreur : ${error.message || "chargement impossible"}`);
        }
      } finally {
        state[stateKey].loading = false;
      }
    }

    function startQuestionnaireAutoRefresh() {
      if (state.questionnaireAutoRefreshTimer) {
        window.clearInterval(state.questionnaireAutoRefreshTimer);
      }
      state.questionnaireAutoRefreshTimer = window.setInterval(() => {
        if (document.hidden) return;
        loadQuestionnaireResponses("candidate", { silent: true });
        loadQuestionnaireResponses("employer", { silent: true });
      }, 30000);
    }

    async function updateQuestionnaireResponseStatus(role, recordId, status, reason) {
      const isCandidate = role === "candidate";
      const statusId = isCandidate ? "candidate-response-status-line" : "employer-response-status-line";
      setStatus(statusId, status === "disabled" ? "Archivage de la réponse..." : "Réactivation de la réponse...");
      try {
        const response = await fetch(apiUrl(`/admin/questionnaires/${role}/${recordId}/status`), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ status, reason }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        await loadQuestionnaireResponses(role);
        await loadMatchings();
        await loadTasks();
        await loadCockpit();
        setStatus(statusId, status === "disabled" ? "Réponse archivée." : "Réponse réactivée.");
      } catch (error) {
        setStatus(statusId, `Erreur : ${error.message || "mise à jour impossible"}`);
      }
    }

    async function deleteQuestionnaireResponse(role, recordId) {
      const isCandidate = role === "candidate";
      const statusId = isCandidate ? "candidate-response-status-line" : "employer-response-status-line";
      setStatus(statusId, "Suppression de la réponse...");
      try {
        const response = await fetch(apiUrl(`/admin/questionnaires/${role}/${recordId}`), {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            "Accept": "application/json",
          },
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        await loadQuestionnaireResponses(role);
        await loadMatchings();
        await loadTasks();
        await loadCockpit();
        setStatus(statusId, `Réponse supprimée. ${payload.deleted_matchings || 0} matching(s) associé(s) supprimé(s).`);
      } catch (error) {
        setStatus(statusId, `Erreur : ${error.message || "suppression impossible"}`);
      }
    }

    async function createManualMatching(sendDirectly = false) {
      const candidateRecordId = Number(document.getElementById("manual-match-candidate").value || 0);
      const employerRecordId = Number(document.getElementById("manual-match-employer").value || 0);
      const employerEmailComment = document.getElementById("manual-match-employer-comment").value.trim();
      const candidateEmailComment = document.getElementById("manual-match-candidate-comment").value.trim();
      if (!candidateRecordId || !employerRecordId) {
        setStatus("manual-match-status-line", "Erreur : sélectionnez un candidat et un besoin employeur.");
        return;
      }

      setStatus("manual-match-status-line", sendDirectly ? "Création et envoi du matching..." : "Création du matching manuel...");
      try {
        const response = await fetch(apiUrl("/admin/matchings/manual"), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            candidate_record_id: candidateRecordId,
            employer_record_id: employerRecordId,
            employer_email_comment: employerEmailComment,
            candidate_email_comment: candidateEmailComment,
            send_directly: sendDirectly,
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus(
          "manual-match-status-line",
          sendDirectly
            ? `Matching créé et envoyé : score ${payload.score ?? 0}, statut ${payload.statut || "-"}.`
            : `Matching créé : score ${payload.score ?? 0}, statut ${payload.statut || "-"}.`
        );
        document.getElementById("manual-match-candidate").value = "";
        document.getElementById("manual-match-employer").value = "";
        document.getElementById("manual-match-employer-comment").value = "";
        document.getElementById("manual-match-candidate-comment").value = "";
        renderManualMatchingPreview();
        await loadMatchings();
        await loadTasks();
        await loadCockpit();
      } catch (error) {
        setStatus("manual-match-status-line", `Erreur : ${error.message || (sendDirectly ? "création / envoi impossible" : "création impossible")}`);
      }
    }

    async function sendMatchingTestEmails() {
      const button = document.getElementById("matching-test-emails-btn");
      if (button) button.disabled = true;
      setStatus("manual-match-status-line", "Envoi des mails tests en cours...");
      try {
        const response = await fetch(apiUrl("/admin/matchings/test-emails"), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({}),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus(
          "manual-match-status-line",
          `Mails tests envoyés : employeur ${payload.employer_email || "-"} ; candidat ${payload.candidate_email || "-"}.`
        );
      } catch (error) {
        setStatus("manual-match-status-line", `Erreur test mails : ${error.message || "envoi impossible"}`);
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function sendSpontaneousCandidate() {
      const candidateRecordId = Number(document.getElementById("spontaneous-candidate").value || 0);
      const employerCompany = document.getElementById("spontaneous-employer-company").value.trim();
      const employerContact = document.getElementById("spontaneous-employer-contact").value.trim();
      const employerEmail = document.getElementById("spontaneous-employer-email").value.trim();
      const employerNeed = document.getElementById("spontaneous-employer-need").value.trim();
      const employerComment = document.getElementById("spontaneous-employer-comment").value.trim();
      const candidateComment = document.getElementById("spontaneous-candidate-comment").value.trim();
      if (!candidateRecordId || !employerCompany || !employerEmail) {
        setStatus("spontaneous-status-line", "Erreur : sélectionnez un candidat et renseignez l’entreprise et son email.");
        return;
      }
      setStatus("spontaneous-status-line", "Envoi de la candidature à l’employeur, puis information du candidat...");
      try {
        const response = await fetch(apiUrl("/admin/spontaneous-candidate"), {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            candidate_record_id: candidateRecordId,
            employer_company: employerCompany,
            employer_contact: employerContact,
            employer_email: employerEmail,
            employer_need: employerNeed,
            employer_comment: employerComment,
            candidate_comment: candidateComment,
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || `Erreur API (${response.status})`);
        setStatus("spontaneous-status-line", `Candidature envoyée à ${payload.employer_email} ; candidat informé à ${payload.candidate_email}.`);
        await loadSpontaneousCandidates();
      } catch (error) {
        setStatus("spontaneous-status-line", `Erreur : ${error.message || "envoi impossible"}`);
      }
    }

    function spontaneousStatusLabel(status) {
      return ({
        sending: "Envoi en cours",
        employer_sent: "Employeur contacté",
        waiting_employer: "En attente employeur",
        interested: "Employeur intéressé",
        not_interested: "Employeur non intéressé",
        no_response: "Sans réponse",
        closed: "Clôturée",
        send_error: "Erreur d’envoi",
      })[String(status || "").toLowerCase()] || status || "Inconnu";
    }

    async function loadSpontaneousCandidates() {
      const target = document.getElementById("spontaneous-list");
      try {
        const response = await fetch(apiUrl("/admin/spontaneous-candidates"), { credentials: "same-origin", headers: { "Accept": "application/json" } });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || `Erreur API (${response.status})`);
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        target.innerHTML = rows.length ? rows.map((row) => `
          <article class="invitation-card" data-spontaneous-id="${esc(row.record_id)}">
            <div class="matching-row-main">${esc(row.candidate_name || "Candidat")} → ${esc(row.employer_company || "Employeur")}</div>
            <div class="matching-row-sub">${esc(row.employer_email || "-")} · ${esc(row.sent_at || "-")}</div>
            <div class="inline-actions" style="margin-top:0.7rem;">
              <span class="pill pending">${esc(spontaneousStatusLabel(row.status))}</span>
              <button class="btn-secondary" type="button" data-spontaneous-status="interested">Intéressé</button>
              <button class="btn-secondary" type="button" data-spontaneous-status="not_interested">Non intéressé</button>
              <button class="btn-secondary" type="button" data-spontaneous-status="no_response">Sans réponse</button>
              <button class="btn-secondary" type="button" data-spontaneous-status="closed">Clôturer</button>
            </div>
          </article>`).join("") : `<div class="empty-state">Aucune candidature spontanée enregistrée.</div>`;
        for (const button of target.querySelectorAll("[data-spontaneous-status]")) {
          button.addEventListener("click", async (event) => {
            const recordId = Number(event.currentTarget.closest("[data-spontaneous-id]")?.dataset.spontaneousId || 0);
            const status = event.currentTarget.dataset.spontaneousStatus;
            if (!recordId || !status) return;
            const update = await fetch(apiUrl(`/admin/spontaneous-candidates/${recordId}/status`), {
              method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ status }),
            });
            const result = await update.json();
            if (!update.ok || !result.ok) {
              setStatus("spontaneous-status-line", `Erreur : ${result.error || "mise à jour impossible"}`);
              return;
            }
            await loadSpontaneousCandidates();
          });
        }
      } catch (error) {
        target.innerHTML = `<div class="empty-state">Erreur : ${esc(error.message || "chargement impossible")}</div>`;
      }
    }

    async function sendSelectedEmailTest() {
      const button = document.getElementById("email-test-send-btn");
      const emailType = document.getElementById("email-test-type")?.value || "";
      const recipientEmail = document.getElementById("email-test-recipient")?.value.trim() || "";
      if (!recipientEmail) {
        setStatus("email-test-status-line", "Erreur : indiquez l’adresse qui doit recevoir le test.");
        return;
      }
      if (button) button.disabled = true;
      setStatus("email-test-status-line", "Envoi du test en cours...");
      try {
        const response = await fetch(apiUrl("/admin/email-tests/send"), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            email_type: emailType,
            recipient_email: recipientEmail,
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus(
          "email-test-status-line",
          `Email test envoyé à ${payload.recipient_email || recipientEmail}. Objet : ${payload.subject || "-"}`
        );
      } catch (error) {
        setStatus("email-test-status-line", `Erreur : ${error.message || "envoi impossible"}`);
      } finally {
        if (button) button.disabled = false;
      }
    }

    function setTechnicalView(view) {
      const implementedViews = ["health", "brevo", "email-tests", "visit-analytics"];
      const placeholderViews = Object.keys(technicalPlaceholderCopy);
      const normalizedView = [...implementedViews, ...placeholderViews].includes(view) ? view : "health";
      const visibleSection = implementedViews.includes(normalizedView) ? normalizedView : "placeholder";
      state.technicalView = normalizedView;
      for (const section of document.querySelectorAll("[data-technical-section]")) {
        section.hidden = section.dataset.technicalSection !== visibleSection;
      }
      if (visibleSection === "placeholder") {
        const copy = technicalPlaceholderCopy[normalizedView] || technicalPlaceholderCopy.logs;
        document.getElementById("technical-placeholder-title").textContent = copy.title;
        document.getElementById("technical-placeholder-text").textContent = copy.text;
      }
      for (const button of document.querySelectorAll(".admin-side-nav button")) {
        const target = button.dataset.openList || "";
        if (target.startsWith("technical-")) {
          button.classList.toggle("active", technicalViewByTarget[target] === normalizedView);
        }
      }
    }

    function setMatchingAdminView(view) {
      state.matchings.view = view || "pending";
      const copyByView = {
        all: {
          title: "Tous les matchings",
          copy: "Vue complète d’historique et de contrôle. Elle n’est pas une file imposée par le système."
        },
        pending: {
          title: "Matchings à valider",
          copy: "Matchings proposés par le système qui demandent une décision admin."
        },
        "employer-responded": {
          title: "Employeurs ayant répondu",
          copy: "Retours employeurs reçus qui demandent une suite opérationnelle."
        },
        accepted: {
          title: "Mises en relation en cours",
          copy: "Matchings déjà acceptés. Cette vue sert au suivi, pas au traitement initial."
        },
        "manual-sent": {
          title: "Matchings manuels envoyés",
          copy: "Historique des matchings créés manuellement et déjà envoyés."
        }
      };
      const copy = copyByView[state.matchings.view] || copyByView.pending;
      const titleEl = document.getElementById("matching-view-title");
      const copyEl = document.getElementById("matching-view-copy");
      if (titleEl) titleEl.textContent = copy.title;
      if (copyEl) copyEl.textContent = copy.copy;
      const statusFilter = document.getElementById("filter-status");
      const sourceFilter = document.getElementById("filter-source");
      if (statusFilter) {
        statusFilter.hidden = ["pending", "employer-responded"].includes(state.matchings.view);
      }
      if (sourceFilter) {
        sourceFilter.hidden = ["pending", "employer-responded"].includes(state.matchings.view);
      }
    }

    function matchingViewTarget(target) {
      const map = {
        "matchings-all": "all",
        "matchings-pending": "pending",
        "matchings-employer-responded": "employer-responded",
        "matchings-accepted": "accepted",
        "matchings-manual-sent": "manual-sent"
      };
      return map[target] || "";
    }

    function openAdminList(target) {
      if (target === "invitations") {
        activateTab("invitations");
        setInvitationView("dashboard");
        loadInvitations();
        return;
      }
      if (target === "matchings-manual-builder") {
        activateTab("invitations");
        setInvitationView("manual-matching");
        Promise.all([
          loadQuestionnaireResponses("candidate"),
          loadQuestionnaireResponses("employer"),
        ]).then(() => {
          renderManualMatchingOptions();
          renderManualMatchingPreview();
        });
        return;
      }
      if (invitationViewTarget(target)) {
        activateTab("invitations");
        setInvitationView(invitationViewTarget(target));
        loadInvitations();
        return;
      }
      if (target === "candidate-responses") {
        activateTab("candidate-responses");
        loadQuestionnaireResponses("candidate");
        return;
      }
      if (target === "employer-responses") {
        activateTab("employer-responses");
        loadQuestionnaireResponses("employer");
        return;
      }
      if (target === "matchings-all") {
        setMatchingAdminView("all");
        document.getElementById("filter-status").value = "all";
        document.getElementById("filter-source").value = "all";
        activateTab("matchings");
        loadMatchings();
        return;
      }
      if (target === "matchings-pending") {
        setMatchingAdminView("pending");
        document.getElementById("filter-status").value = "pending";
        document.getElementById("filter-source").value = "all";
        activateTab("matchings");
        loadMatchings();
        return;
      }
      if (target === "matchings-employer-responded") {
        setMatchingAdminView("employer-responded");
        document.getElementById("filter-status").value = "employer_responded";
        document.getElementById("filter-source").value = "all";
        activateTab("matchings");
        loadMatchings();
        return;
      }
      if (target === "matchings-accepted") {
        setMatchingAdminView("accepted");
        document.getElementById("filter-status").value = "accepted";
        document.getElementById("filter-source").value = "all";
        activateTab("matchings");
        loadMatchings();
        return;
      }
      if (target === "matchings-manual-sent") {
        setMatchingAdminView("manual-sent");
        document.getElementById("filter-status").value = "accepted";
        document.getElementById("filter-source").value = "manual";
        activateTab("matchings");
        loadMatchings();
        return;
      }
      if (target.startsWith("technical-")) {
        activateTab("cockpit");
        const technicalView = technicalViewByTarget[target] || "health";
        setTechnicalView(technicalView);
        if (technicalView === "brevo") {
          loadBrevoHealth();
        }
        if (technicalView === "visit-analytics") {
          loadVisitAnalytics();
        }
        return;
      }
      if (target === "tasks") {
        activateTab("tasks");
        loadTasks();
        return;
      }
      if (target === "no-match") {
        activateTab("no-match");
        loadNoMatch();
        return;
      }
      if (target === "new-jobs") {
        activateTab("new-jobs");
        loadNewJobs();
        return;
      }
    }

    async function openMatchingRecord(recordId) {
      if (!recordId) return;
      setMatchingAdminView("all");
      document.getElementById("filter-status").value = "all";
      document.getElementById("filter-source").value = "all";
      activateTab("matchings");
      await loadMatchings();
      const card = document.querySelector(`#matching-list .matching-card[data-record-id="${CSS.escape(String(recordId))}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        card.style.outline = "3px solid rgba(22, 95, 190, 0.28)";
        card.style.outlineOffset = "6px";
        window.setTimeout(() => {
          card.style.outline = "";
          card.style.outlineOffset = "";
        }, 2200);
      }
    }

    async function loadCockpit() {
      if (state.cockpit.loading) return;
      state.cockpit.loading = true;
      setStatus("cockpit-status-line", "Vérification technique en cours...");
      try {
        const response = await fetch(apiUrl("/admin/cockpit"), { credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        state.cockpit.data = payload.cockpit || null;
        updateTaskMenuBadgesFromCockpit();
        renderCockpit();
        setStatus("cockpit-status-line", "Contrôle technique chargé.");
      } catch (error) {
        setStatus("cockpit-status-line", `Erreur : ${error.message || "chargement impossible"}`);
      } finally {
        state.cockpit.loading = false;
      }
    }

    async function loadTasks() {
      if (state.tasks.loading) return;
      state.tasks.loading = true;
      setStatus("task-status-line", "Chargement des tâches...");
      const status = document.getElementById("task-filter-status").value;
      const url = new URL(apiUrl("/admin/tasks"), window.location.origin);
      if (status) url.searchParams.set("status", status);
      try {
        const response = await fetch(url.toString(), { credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        state.tasks.rows = Array.isArray(payload.rows) ? payload.rows : [];
        document.getElementById("task-kpi-total").textContent = payload.stats?.total ?? 0;
        document.getElementById("task-kpi-pending").textContent = payload.stats?.pending ?? 0;
        document.getElementById("task-kpi-done").textContent = payload.stats?.done ?? 0;
        document.getElementById("task-kpi-dismissed").textContent = payload.stats?.dismissed ?? 0;
        setTaskMenuCount("tasks", payload.stats?.pending ?? 0);
        renderTaskRows();
        setStatus("task-status-line", `${state.tasks.rows.length} tâche(s) chargée(s).`);
      } catch (error) {
        document.getElementById("task-list").innerHTML = `<div class="empty-state">${esc(error.message || "Erreur de chargement")}</div>`;
        setStatus("task-status-line", `Erreur : ${error.message || "chargement impossible"}`);
      } finally {
        state.tasks.loading = false;
      }
    }

    async function loadInvitations() {
      if (state.invitations.loading) return;
      state.invitations.loading = true;
      setStatus("invite-status-line", "Chargement des invitations...");

      const status = document.getElementById("invite-filter-status").value;
      const url = new URL(apiUrl("/admin/invitations"), window.location.origin);
      if (status && status !== "all" && status !== "reminder_due" && status !== "duplicate_followup_pending") {
        url.searchParams.set("status", status);
      }

      try {
        const response = await fetch(url.toString(), { credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        state.invitations.rows = Array.isArray(payload.rows) ? payload.rows : [];
        state.invitations.selectedIds = state.invitations.selectedIds.filter((recordId) =>
          state.invitations.rows.some((row) =>
            Number(row.record_id) === Number(recordId)
            && row.invitation_status === "invitation_a_envoyer"
            && row.duplicate_followup_status !== "pending"
          )
        );
        updateInvitationKpis(payload.stats || {});
        renderInvitations();
        renderDataHistoryView();
        setStatus("invite-status-line", `${state.invitations.rows.length} invitation(s) chargée(s).`);
        if (state.invitations.view === "errors") {
          await autoDeleteDuplicateInvitations();
        }
      } catch (error) {
        document.getElementById("invitation-list").innerHTML = `<div class="empty-state">${esc(error.message || "Erreur de chargement")}</div>`;
        setStatus("invite-status-line", `Erreur : ${error.message || "chargement impossible"}`);
      } finally {
        state.invitations.loading = false;
      }
    }

    async function importInvitations(payload) {
      setStatus("invite-status-line", "Import des invitations en cours...");
      try {
        const response = await fetch(apiUrl("/admin/invitations/import"), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result.error || `Erreur API (${response.status})`);
        }
        const skippedCount = Array.isArray(result.skipped) ? result.skipped.length : 0;
        const skippedNote = skippedCount ? `, ${skippedCount} ignorée(s)` : "";
        await loadInvitations();
        setStatus("invite-status-line", `Import terminé : ${result.created || 0} créée(s), ${result.updated || 0} mise(s) à jour${skippedNote}.`);
        return result;
      } catch (error) {
        setStatus("invite-status-line", `Erreur : ${error.message || "import impossible"}`);
        return null;
      }
    }

    async function sendInvitations(recordIds = []) {
      setStatus("invite-status-line", "Envoi des invitations en cours...");
      try {
        const response = await fetch(apiUrl("/admin/invitations/send"), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(recordIds.length ? { record_ids: recordIds } : {}),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        const sentCount = Array.isArray(payload.sent) ? payload.sent.length : 0;
        const errorCount = Array.isArray(payload.errors) ? payload.errors.length : 0;
        const followupCount = Array.isArray(payload.skipped)
          ? payload.skipped.filter((row) => row.followup_created).length
          : 0;
        const followupNote = followupCount ? `, ${followupCount} relance(s) à arbitrer` : "";
        const processed = Number(payload.processed || sentCount + errorCount);
        const requested = Number(payload.requested || processed);
        const remaining = Number(payload.remaining_after_batch || 0);
        const batchNote = remaining > 0
          ? ` Lot traité : ${processed}/${requested}. ${remaining} invitation(s) restent à envoyer : relancez l’envoi pour le lot suivant.`
          : "";
        setStatus("invite-status-line", `Envoi terminé : ${sentCount} envoyé(s), ${errorCount} erreur(s)${followupNote}.${batchNote}`);
        await loadInvitations();
        await loadCockpit();
        await loadTasks();
      } catch (error) {
        setStatus("invite-status-line", `Erreur : ${error.message || "envoi impossible"}`);
      }
    }

    async function sendInvitationReminders(recordIds = []) {
      setStatus("invite-status-line", "Envoi des relances en cours...");
      try {
        const response = await fetch(apiUrl("/admin/invitations/remind"), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(recordIds.length ? { record_ids: recordIds } : {}),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        const remindedCount = Array.isArray(payload.reminded) ? payload.reminded.length : 0;
        const errorCount = Array.isArray(payload.errors) ? payload.errors.length : 0;
        setStatus("invite-status-line", `Relance terminée : ${remindedCount} relancée(s), ${errorCount} erreur(s).`);
        await loadInvitations();
        await loadCockpit();
      } catch (error) {
        setStatus("invite-status-line", `Erreur : ${error.message || "relance impossible"}`);
      }
    }

    async function deleteInvitationError(recordId, kind = "error") {
      const isDuplicate = kind === "duplicate";
      setStatus("invite-status-line", isDuplicate ? "Suppression de l’invitation doublon..." : "Suppression de l’invitation en erreur...");
      try {
        const response = await fetch(apiUrl(`/admin/invitations/${recordId}`), {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            "Accept": "application/json",
          },
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus("invite-status-line", isDuplicate ? "Invitation doublon supprimée." : "Invitation en erreur supprimée.");
        await loadInvitations();
        await loadCockpit();
        await loadTasks();
      } catch (error) {
        setStatus("invite-status-line", `Erreur : ${error.message || "suppression impossible"}`);
      }
    }

    async function autoDeleteDuplicateInvitations() {
      const duplicates = state.invitations.rows.filter((row) => row.duplicate_followup_status === "pending");
      if (!duplicates.length) {
        return 0;
      }
      setStatus("invite-status-line", `Suppression automatique de ${duplicates.length} doublon(s)...`);
      let deletedCount = 0;
      for (const row of duplicates) {
        const recordId = Number(row.record_id || 0);
        if (!recordId) continue;
        const response = await fetch(apiUrl(`/admin/invitations/${recordId}`), {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            "Accept": "application/json",
          },
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        deletedCount += 1;
      }
      const deletedIds = new Set(duplicates.map((row) => Number(row.record_id || 0)).filter(Boolean));
      state.invitations.rows = state.invitations.rows.filter((row) => !deletedIds.has(Number(row.record_id || 0)));
      renderInvitations();
      setStatus("invite-status-line", `${deletedCount} doublon(s) supprimé(s) automatiquement.`);
      await loadCockpit();
      await loadTasks();
      return deletedCount;
    }

    async function submitDuplicateFollowup(recordId, action, note) {
      setStatus("invite-status-line", action === "remind" ? "Envoi de la relance..." : "Clôture de la proposition...");
      try {
        const response = await fetch(apiUrl(`/admin/invitations/${recordId}/duplicate-followup`), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ action, note }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus("invite-status-line", action === "remind" ? "Relance envoyée." : "Proposition ignorée.");
        await loadInvitations();
        await loadCockpit();
        await loadTasks();
      } catch (error) {
        setStatus("invite-status-line", `Erreur : ${error.message || "action impossible"}`);
      }
    }

    function buildSingleInvitationPayload(manualFtSent = false) {
      const role = document.getElementById("single-role").value;
      const email = document.getElementById("single-email").value.trim();
      if (!email) {
        throw new Error("Email requis");
      }
      if (manualFtSent && role !== "candidate") {
        throw new Error("L’enregistrement “envoyée depuis FT” est réservé aux invitations candidat.");
      }
      const selectedTargetJob = role === "candidate"
        ? document.getElementById("single-target-job").value.trim()
        : "";
      const notes = document.getElementById("single-notes").value.trim();
      const manualFtNote = "Invitation envoyée manuellement depuis l’adresse France Travail. Aucun envoi Brevo.";
      return {
        rows: [{
          role,
          email,
          first_name: document.getElementById("single-first-name").value.trim(),
          last_name: document.getElementById("single-last-name").value.trim(),
          company_name: document.getElementById("single-company").value.trim(),
          language: document.getElementById("single-language").value.trim() || "fr",
          source: manualFtSent ? "ft_manual_email" : (document.getElementById("single-source").value.trim() || "admin_manual"),
          external_ref: document.getElementById("single-external-ref").value.trim(),
          campaign_type: role === "candidate" ? document.getElementById("single-campaign-type").value.trim() : "",
          target_job_keys: selectedTargetJob ? [selectedTargetJob] : [],
          notes: manualFtSent ? [notes, manualFtNote].filter(Boolean).join("\n\n") : notes,
          invitation_status: manualFtSent ? "invitation_envoyee" : "invitation_a_envoyer",
          sent_at: manualFtSent ? new Date().toISOString() : "",
          sent_by: manualFtSent ? "admin_ft_email_manual" : "",
          brevo_message_id: "",
        }],
      };
    }

    function updateSingleInvitationRoleUI() {
      const role = document.getElementById("single-role").value;
      const targetBlock = document.getElementById("candidate-target-jobs-block");
      const campaignBlock = document.getElementById("candidate-campaign-type-block");
      if (!targetBlock) return;
      const isCandidate = role === "candidate";
      targetBlock.hidden = !isCandidate;
      if (campaignBlock) campaignBlock.hidden = !isCandidate;
      const manualFtButton = document.getElementById("single-save-ft-manual-btn");
      if (manualFtButton) manualFtButton.hidden = !isCandidate;
      if (!isCandidate) {
        const select = document.getElementById("single-target-job");
        if (select) select.value = "";
        const campaignSelect = document.getElementById("single-campaign-type");
        if (campaignSelect) campaignSelect.value = "";
      }
    }

    function resetSingleInvitationForm() {
      document.getElementById("single-role").value = "candidate";
      document.getElementById("single-language").value = "fr";
      document.getElementById("single-email").value = "";
      document.getElementById("single-company").value = "";
      document.getElementById("single-first-name").value = "";
      document.getElementById("single-last-name").value = "";
      document.getElementById("single-external-ref").value = "";
      document.getElementById("single-source").value = "admin_manual";
      document.getElementById("single-campaign-type").value = "";
      document.getElementById("single-target-job").value = "";
      document.getElementById("single-notes").value = "";
      updateSingleInvitationRoleUI();
    }

    function sampleCsv() {
      return document.getElementById("csv-example").textContent.trim();
    }

    function renderCockpit() {
      const container = document.getElementById("cockpit-grid");
      if (!container) return;
      const data = state.cockpit.data;
      if (!data) {
        container.innerHTML = `<div class="empty-state">Aucune donnée cockpit disponible.</div>`;
        return;
      }

      const priorities = data.priorities || {};
      const todayFlow = data.today_flow || {};
      const funnel = data.funnel || {};
      const delays = data.delays || {};
      const activity = Array.isArray(data.recent_activity) ? data.recent_activity : [];
      const brevo = state.brevo || null;
      const unseenCandidate = Number(state.candidateResponses.unseenCount || 0);
      const unseenEmployer = Number(state.employerResponses.unseenCount || 0);
      const pendingDecisions =
        Number(priorities.matching_review || 0) +
        Number(priorities.no_match_followup || 0) +
        Number(priorities.new_job_request || 0) +
        Number(priorities.new_employer_alert || 0) +
        Number(priorities.duplicate_invitation_followup || 0);
      const alertCount =
        Number(priorities.invitation_errors || 0) +
        Number(priorities.duplicate_invitation_followup || 0) +
        Number(priorities.new_employer_alert || 0);
      const responseSignals = unseenCandidate + unseenEmployer;

      function formatHours(value) {
        return value != null ? `${value} h` : "-";
      }

      function signalTone(count, warningThreshold = 1) {
        if (count >= warningThreshold && count > 0) return "warning";
        return "success";
      }

      function healthTone() {
        if (!brevo?.configured) return "danger";
        if (brevo?.api_ok === false) return "danger";
        if (brevo?.api_ok === true) return "success";
        return "warning";
      }

      function healthLabel() {
        if (!brevo?.configured) return "Brevo non configuré";
        if (brevo?.api_ok === false) return "Brevo en incident";
        if (brevo?.api_ok === true) return "Brevo opérationnel";
        return "Brevo à vérifier";
      }

      const metricRows = (rows, options = {}) => rows.map((row) => `
        <div class="metric-row ${options.actionable ? "actionable" : ""}" ${options.actionable ? `data-${esc(options.targetAttr || "priority-target")}="${esc(row.target || "")}"` : ""}>
          <span>${esc(row.label)}</span>
          <strong>${esc(row.value)}</strong>
        </div>
      `).join("");

      const activityRows = activity.length
        ? activity.map((row) => `
            <div class="activity-row">
              <span>
                ${esc(row.label || "-")}
                ${row.detail ? `<small>${esc(row.detail)}</small>` : ""}
              </span>
              <strong>${esc(row.at || "-")}</strong>
            </div>
          `).join("")
        : `<div class="empty-state">Aucune activité récente.</div>`;

      container.innerHTML = `
        <article class="cockpit-card cockpit-hero-card">
          <div class="cockpit-hero-grid">
            <div class="cockpit-hero-main">
              <span class="cockpit-hero-eyebrow">Surveillance technique</span>
              <h2>Vérifier que le service fonctionne</h2>
              <p>Cet onglet sert aux contrôles système : santé Brevo, erreurs d’envoi, activité récente, volumes et délais. Les décisions métier restent dans l’onglet À traiter.</p>
              <div class="cockpit-hero-kpis">
                <div class="cockpit-hero-kpi">
                  <strong>${esc(pendingDecisions)}</strong>
                  <span>décision(s) en attente</span>
                </div>
                <div class="cockpit-hero-kpi">
                  <strong>${esc(responseSignals)}</strong>
                  <span>nouvelle(s) réponse(s) détectée(s)</span>
                </div>
                <div class="cockpit-hero-kpi">
                  <strong>${esc(alertCount)}</strong>
                  <span>signal(s) de vigilance</span>
                </div>
              </div>
              <div class="cockpit-hero-actions">
                <button class="cockpit-primary-btn" type="button" data-open-list="tasks">Aller aux actions à traiter</button>
                <button class="cockpit-secondary-btn" type="button" data-open-list="matchings-pending">Voir les matchings à valider</button>
                <button class="cockpit-secondary-btn" type="button" data-open-list="matchings-manual-builder">Créer un matching manuel</button>
              </div>
            </div>
            <div class="cockpit-side-stack">
              <article class="cockpit-signal-card ${signalTone(responseSignals)}">
                <div class="cockpit-signal-head">
                  <div>
                    <strong>Nouvelles réponses</strong>
                    <p>Candidats : ${esc(unseenCandidate)} · Employeurs : ${esc(unseenEmployer)}</p>
                  </div>
                  <div class="cockpit-signal-count">
                    <strong>${esc(responseSignals)}</strong>
                    <span>à ouvrir</span>
                  </div>
                </div>
              </article>
              <article class="cockpit-signal-card ${signalTone(priorities.matching_review ?? 0)}">
                <div class="cockpit-signal-head">
                  <div>
                    <strong>Matchings à arbitrer</strong>
                    <p>Décisions humaines à prendre avant envoi ou clôture.</p>
                  </div>
                  <div class="cockpit-signal-count">
                    <strong>${esc(priorities.matching_review ?? 0)}</strong>
                    <span>en attente</span>
                  </div>
                </div>
              </article>
              <article class="cockpit-signal-card ${healthTone()}">
                <div class="cockpit-signal-head">
                  <div>
                    <strong>${esc(healthLabel())}</strong>
                    <p>${esc(brevo?.message || "Aucune information de santé disponible pour le moment.")}</p>
                  </div>
                  <div class="cockpit-signal-count">
                    <strong>${esc(Number(priorities.invitation_errors || 0))}</strong>
                    <span>erreur(s)</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </article>

        <article class="cockpit-card">
          <h3>Décisions à prendre maintenant</h3>
          <p class="cockpit-section-intro">Les tâches les plus sensibles sont isolées ici pour éviter de naviguer dans plusieurs écrans avant d’agir.</p>
          <div class="cockpit-priority-list">
            ${[
              {
                title: "Valider les matchings",
                count: priorities.matching_review ?? 0,
                detail: "Arbitrages sur les rapprochements calculés ou créés manuellement.",
                action: "Ouvrir la file de validation",
                targetType: "priority",
                target: "matching_review",
              },
              {
                title: "Notifier l’absence de matching",
                count: priorities.no_match_followup ?? 0,
                detail: "Entrées qui nécessitent un retour explicite au candidat ou à l’employeur.",
                action: "Ouvrir les cas sans matching",
                targetType: "priority",
                target: "no_match_followup",
              },
              {
                title: "Surveiller les nouveaux employeurs",
                count: priorities.new_employer_alert ?? 0,
                detail: "Demandes déposées par de nouvelles structures à examiner avec plus de vigilance.",
                action: "Ouvrir ces alertes",
                targetType: "priority",
                target: "new_employer_alert",
              },
            ].map((item) => `
              <article class="cockpit-priority-item">
                <div class="cockpit-priority-head">
                  <div>
                    <strong>${esc(item.title)}</strong>
                    <p>${esc(item.detail)}</p>
                  </div>
                  <div class="cockpit-priority-count">
                    <strong>${esc(item.count)}</strong>
                    <span>cas</span>
                  </div>
                </div>
                <footer>
                  <button class="cockpit-secondary-btn" type="button" data-priority-target="${esc(item.target)}">${esc(item.action)}</button>
                </footer>
              </article>
            `).join("")}
          </div>
        </article>

        <article class="cockpit-card">
          <h3>Raccourcis opérationnels</h3>
          <p class="cockpit-section-intro">Accès direct aux vues les plus utilisées dans le pilotage quotidien.</p>
          <div class="cockpit-quick-grid">
            ${[
              {
                title: "Réponses candidats",
                detail: `Consulter les questionnaires reçus et leurs matchings liés. ${unseenCandidate ? `${unseenCandidate} nouvelle(s) réponse(s).` : ""}`.trim(),
                target: "candidate-responses",
                action: "Ouvrir les réponses candidats",
              },
              {
                title: "Réponses employeurs",
                detail: `Consulter les besoins reçus et leur prise en compte dans le matching. ${unseenEmployer ? `${unseenEmployer} nouvelle(s) réponse(s).` : ""}`.trim(),
                target: "employer-responses",
                action: "Ouvrir les réponses employeurs",
              },
              {
                title: "Invitations et relances",
                detail: "Gérer les invitations à envoyer, les relances et les erreurs d’envoi.",
                target: "invitations",
                action: "Ouvrir les invitations",
              },
              {
                title: "Matchings manuels",
                detail: "Créer rapidement un rapprochement manuel quand l’automatique ne suffit pas.",
                target: "matchings-manual-builder",
                action: "Créer un matching manuel",
              },
            ].map((item) => `
              <article class="cockpit-quick-card">
                <div class="cockpit-quick-head">
                  <strong>${esc(item.title)}</strong>
                </div>
                <p>${esc(item.detail)}</p>
                <footer>
                  <button class="cockpit-secondary-btn" type="button" data-open-list="${esc(item.target)}">${esc(item.action)}</button>
                </footer>
              </article>
            `).join("")}
          </div>
        </article>

        <article class="cockpit-card full">
          <h3>Suivi opérationnel</h3>
          <p class="cockpit-section-intro">Vue consolidée du pipeline et des délais pour suivre la progression réelle de l’expérimentation.</p>
          <div class="cockpit-operations-grid">
            <section class="notes-box">
              <h4>Flux du jour</h4>
              <div class="metric-list">
                ${metricRows([
                  { label: "Matchings calculés", value: todayFlow.matchings_calcules ?? 0, target: "matchings-all" },
                  { label: "Matchings manuels envoyés", value: todayFlow.matchings_manuels_envoyes ?? 0, target: "matchings-manual-sent" },
                  { label: "Emails envoyés", value: todayFlow.emails_envoyes ?? 0, target: "invitations" },
                  { label: "Cas sans matching", value: todayFlow.sans_matching_crees ?? 0, target: "tasks" },
                  { label: "Nouveaux métiers demandés", value: todayFlow.nouveaux_metiers_recus ?? 0, target: "tasks" },
                ], { actionable: true, targetAttr: "open-list" })}
              </div>
            </section>
            <section class="notes-box">
              <h4>Entonnoir</h4>
              <div class="metric-list">
                ${metricRows([
                  { label: "Besoins reçus", value: funnel.besoins_recus ?? 0, target: "employer-responses" },
                  { label: "Candidats contactés", value: funnel.candidats_contactes ?? 0, target: "invitations" },
                  { label: "Candidats reçus", value: funnel.candidats_recus ?? 0, target: "candidate-responses" },
                  { label: "Matchings exploitables", value: funnel.matchings_exploitables ?? 0, target: "matchings-all" },
                  { label: "Matchings validés", value: funnel.matchings_valides ?? 0, target: "matchings-accepted" },
                  { label: "Envoyés aux employeurs", value: funnel.envoyes_employeurs ?? 0, target: "matchings-accepted" },
                  { label: "Mises en relation", value: funnel.mises_en_relation ?? 0, target: "matchings-accepted" },
                  { label: "Embauches confirmées", value: funnel.embauches_confirmees ?? 0, target: "matchings-accepted" },
                ], { actionable: true, targetAttr: "open-list" })}
              </div>
            </section>
          </div>
        </article>

        <article class="cockpit-card full">
          <h3>Santé du service</h3>
          <p class="cockpit-section-intro">Indicateurs à surveiller pour éviter les angles morts techniques ou métier.</p>
          <div class="cockpit-health-grid">
            <article class="cockpit-health-item ${healthTone()}">
              <div class="cockpit-health-head">
                <strong>Envoi des emails</strong>
                <span class="pill ${healthTone() === "success" ? "accepted" : healthTone() === "danger" ? "refused" : "pending"}">${esc(healthLabel())}</span>
              </div>
              <p>${esc(brevo?.message || "Le statut Brevo sera affiché ici dès qu’un contrôle aura été fait.")}</p>
              <footer>
                <button class="cockpit-secondary-btn" type="button" data-open-list="invitations">Voir les invitations</button>
              </footer>
            </article>
            <article class="cockpit-health-item ${Number(priorities.invitation_errors || 0) > 0 ? "danger" : "success"}">
              <div class="cockpit-health-head">
                <strong>Erreurs d’envoi</strong>
                <span class="pill ${Number(priorities.invitation_errors || 0) > 0 ? "refused" : "accepted"}">${esc(priorities.invitation_errors ?? 0)} erreur(s)</span>
              </div>
              <p>Les envois qui ont échoué doivent être supprimés ou retraités pour garder un suivi propre.</p>
              <footer>
                <button class="cockpit-secondary-btn" type="button" data-priority-target="invitation_errors">Ouvrir les erreurs</button>
              </footer>
            </article>
            <article class="cockpit-health-item ${Number(priorities.duplicate_invitation_followup || 0) > 0 ? "warning" : "success"}">
              <div class="cockpit-health-head">
                <strong>Doublons à arbitrer</strong>
                <span class="pill ${Number(priorities.duplicate_invitation_followup || 0) > 0 ? "pending" : "accepted"}">${esc(priorities.duplicate_invitation_followup ?? 0)} cas</span>
              </div>
              <p>Ces invitations nécessitent une décision pour éviter une relance inutile ou contradictoire.</p>
              <footer>
                <button class="cockpit-secondary-btn" type="button" data-priority-target="duplicate_invitation_followup">Traiter les doublons</button>
              </footer>
            </article>
            <article class="cockpit-health-item ${Number(priorities.new_employer_alert || 0) > 0 ? "warning" : "success"}">
              <div class="cockpit-health-head">
                <strong>Nouveaux employeurs</strong>
                <span class="pill ${Number(priorities.new_employer_alert || 0) > 0 ? "pending" : "accepted"}">${esc(priorities.new_employer_alert ?? 0)} alerte(s)</span>
              </div>
              <p>Ces demandes viennent de nouvelles structures et méritent un regard renforcé avant traitement complet.</p>
              <footer>
                <button class="cockpit-secondary-btn" type="button" data-priority-target="new_employer_alert">Voir les alertes</button>
              </footer>
            </article>
          </div>
        </article>

        <article class="cockpit-card">
          <h3>Délais moyens</h3>
          <div class="metric-list">
            ${metricRows([
              { label: "Matching -> validation admin", value: formatHours(delays.matching_to_validation_hours) },
              { label: "Validation -> envoi employeur", value: formatHours(delays.validation_to_send_hours) },
              { label: "Envoi -> retour employeur", value: formatHours(delays.send_to_response_hours) },
              { label: "Retour -> mise en relation", value: formatHours(delays.response_to_relation_hours) },
            ])}
          </div>
        </article>

        <article class="cockpit-card">
          <h3>Charge à venir</h3>
          <div class="metric-list">
            ${metricRows([
              { label: "Demandes de nouveaux métiers", value: priorities.new_job_request ?? 0, target: "new_job_request" },
              { label: "Cas sans matching à notifier", value: priorities.no_match_followup ?? 0, target: "no_match_followup" },
              { label: "Doublons à arbitrer", value: priorities.duplicate_invitation_followup ?? 0, target: "duplicate_invitation_followup" },
            ], { actionable: true })}
          </div>
        </article>

        <article class="cockpit-card full">
          <h3>Activité récente</h3>
          <div class="activity-list">${activityRows}</div>
        </article>
      `;

      for (const row of container.querySelectorAll("[data-priority-target]")) {
        row.addEventListener("click", async (event) => {
          const target = event.currentTarget.dataset.priorityTarget || "";
          await openPriorityTarget(target);
        });
      }
      for (const row of container.querySelectorAll("[data-open-list]")) {
        row.addEventListener("click", async (event) => {
          const target = event.currentTarget.dataset.openList || "";
          openAdminList(target);
        });
      }
    }

    async function openPriorityTarget(target) {
      if (target === "invitation_errors") {
        activateTab("invitations");
        document.getElementById("invite-filter-status").value = "erreur_envoi";
        await loadInvitations();
        return;
      }
      activateTab("tasks");
      document.getElementById("task-filter-status").value = "pending";
      const searchMap = {
        matching_review: "matching",
        no_match_followup: "sans matching",
        new_job_request: "nouveau métier",
        new_employer_alert: "nouvel employeur",
        duplicate_invitation_followup: "invitation en doublon",
      };
      document.getElementById("task-filter-search").value = searchMap[target] || "";
      await loadTasks();
    }

    function renderTaskRows() {
      const list = document.getElementById("task-list");
      const search = normalizeText(document.getElementById("task-filter-search").value.trim());
      const filtered = state.tasks.rows.filter((row) => taskMatchesSearch(row, search));

      if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Aucune tâche ne correspond aux filtres actuels.</div>`;
        return;
      }

      list.innerHTML = filtered.map((row) => {
        const statusClass = row.status === "done" ? "accepted" : row.status === "dismissed" ? "refused" : "pending";
        const priorityLabel = row.priority === "high" ? "priorité haute" : "priorité normale";
        let body = "";
        let actions = "";
        let noteId = `task-note-${row.task_type}-${row.record_id}`;

        if (row.task_type === "matching_review") {
          const matching = row.matching || {};
          body = `
            <div class="compare-grid">
              <section class="compare-card">
                <h3>Candidat</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Nom</dt><dd>${esc(matching.candidat?.nom || "-")}</dd></div>
                  <div class="detail-row"><dt>Email</dt><dd>${esc(matching.candidat?.email || "-")}</dd></div>
                  <div class="detail-row"><dt>Métiers</dt><dd>${esc(matching.candidat?.metier || "-")}</dd></div>
                  <div class="detail-row"><dt>Langues</dt><dd>${esc(matching.candidat?.langues || "-")}</dd></div>
                </dl>
              </section>
              <section class="compare-card">
                <h3>Besoin</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Entreprise</dt><dd>${esc(matching.employeur?.employeur || "-")}</dd></div>
                  <div class="detail-row"><dt>Poste</dt><dd>${esc(matching.employeur?.poste || "-")}</dd></div>
                  <div class="detail-row"><dt>Pays</dt><dd>${esc(matching.employeur?.pays || "-")}</dd></div>
                  <div class="detail-row"><dt>Score</dt><dd>${esc(matching.score ?? 0)}</dd></div>
                </dl>
              </section>
            </div>
          `;
          actions = `
            <button class="btn-accept" type="button" data-task-matching-action="accepted" data-send-emails="true">Valider et envoyer les mails</button>
            <button class="btn-secondary" type="button" data-task-matching-action="accepted" data-send-emails="false">Valider sans envoyer</button>
            <button class="btn-refuse" type="button" data-task-matching-action="refused">Refuser</button>
          `;
        } else if (row.task_type === "no_match_followup") {
          const noMatch = row.no_match || {};
          const noMatchLabel = noMatch.role === "candidate" ? "candidat" : "employeur";
          const borderlineMatchings = Array.isArray(noMatch.borderline_matchings) ? noMatch.borderline_matchings : [];
          const borderlineBlock = noMatch.role === "candidate" && borderlineMatchings.length ? `
            <section class="compare-card" style="margin-top:1rem;">
              <h3>Matchings à la limite</h3>
              <p style="margin:0 0 0.75rem; line-height:1.6;">
                Aucun matching automatiquement exploitable n’a été trouvé. Ces rapprochements sont proches du seuil et peuvent être réexaminés manuellement.
              </p>
              <div class="linked-matching-list">
                ${borderlineMatchings.map((matching) => {
                  const title = [
                    shortBusinessLabel(matching.employeur || ""),
                    shortBusinessLabel(matching.poste || matching.secteur || ""),
                    shortBusinessLabel(matching.pays || "")
                  ].filter(Boolean).join(" · ");
                  const weaknesses = Array.isArray(matching.points_faibles) ? matching.points_faibles : [];
                  const reasons = Array.isArray(matching.raisons) ? matching.raisons : [];
                  const explanation = weaknesses.length ? weaknesses : reasons;
                  return `
                    <div class="linked-matching-row">
                      <div>
                        <strong>${esc(title || "Rapprochement à examiner")}</strong>
                        ${explanation.length ? `<p>${esc(explanation.slice(0, 2).join(" · "))}</p>` : ""}
                      </div>
                      <div class="decision-actions" style="margin-left:auto;">
                        <span class="pill pending">Score : ${esc(matching.score ?? "-")}/100</span>
                        <button class="btn-accept" type="button" data-borderline-send-matching="${esc(matching.record_id)}">Envoyer ce matching</button>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </section>
          ` : "";
          body = `
            <div class="compare-grid">
              <section class="compare-card">
                <h3>Entrée</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Type</dt><dd>${esc(noMatch.role === "candidate" ? "Candidat" : "Employeur")}</dd></div>
                  <div class="detail-row"><dt>Nom / Structure</dt><dd>${esc(noMatch.title || "-")}</dd></div>
                  <div class="detail-row"><dt>Email</dt><dd>${esc(noMatch.recipient_email || "-")}</dd></div>
                </dl>
              </section>
              <section class="compare-card">
                <h3>Action attendue</h3>
                <p style="margin:0 0 0.7rem; line-height:1.7;">Répondre au ${esc(noMatchLabel)} pour indiquer qu’aucun matching immédiat n’a été trouvé.</p>
                <p style="margin:0; line-height:1.7;">Le commentaire ci-dessous sera ajouté au mail si vous cliquez sur “Envoyer l’email”.</p>
              </section>
            </div>
            ${borderlineBlock}
          `;
          actions = `
            <button class="btn-accept" type="button" data-task-no-match-action="send" data-role="${esc(noMatch.role)}">Envoyer l’email avec ce commentaire</button>
            <button class="btn-refuse" type="button" data-task-no-match-action="dismiss" data-role="${esc(noMatch.role)}">Traiter sans envoyer</button>
          `;
        } else if (row.task_type === "new_job_request") {
          const newJob = row.new_job || {};
          body = `
            <div class="compare-grid">
              <section class="compare-card">
                <h3>Employeur</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Entreprise</dt><dd>${esc(newJob.employeur || "-")}</dd></div>
                  <div class="detail-row"><dt>Poste</dt><dd>${esc(newJob.poste || "-")}</dd></div>
                  <div class="detail-row"><dt>Email</dt><dd>${esc(newJob.email || "-")}</dd></div>
                </dl>
              </section>
              <section class="compare-card">
                <h3>Nouveaux métiers souhaités</h3>
                <p style="margin:0; line-height:1.7;">${esc(newJob.requested_jobs || "-")}</p>
              </section>
            </div>
          `;
          actions = `
            <button class="btn-accept" type="button" data-task-new-job-action="processed">Marquer traité</button>
            <button class="btn-refuse" type="button" data-task-new-job-action="dismissed">Ignorer</button>
          `;
        } else if (row.task_type === "new_employer_alert") {
          const newEmployer = row.new_employer || {};
          body = `
            <div class="compare-grid">
              <section class="compare-card">
                <h3>Employeur déposant</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Entreprise</dt><dd>${esc(newEmployer.employeur || "-")}</dd></div>
                  <div class="detail-row"><dt>Contact</dt><dd>${esc(newEmployer.contact || "-")}</dd></div>
                  <div class="detail-row"><dt>Email</dt><dd>${esc(newEmployer.email || "-")}</dd></div>
                  <div class="detail-row"><dt>Poste</dt><dd>${esc(newEmployer.poste || "-")}</dd></div>
                </dl>
              </section>
              <section class="compare-card">
                <h3>Entreprise marraine</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Entreprise source</dt><dd>${esc(newEmployer.sponsor_company_name || newEmployer.source_invitation_company || "-")}</dd></div>
                  <div class="detail-row"><dt>Email source</dt><dd>${esc(newEmployer.sponsor_email || newEmployer.source_invitation_email || "-")}</dd></div>
                  <div class="detail-row"><dt>Type d’invitation</dt><dd>${esc(newEmployer.source_invitation_scope === "same_company" ? "Collaborateur" : "Autre entreprise")}</dd></div>
                </dl>
              </section>
            </div>
          `;
          actions = `
            <button class="btn-accept" type="button" data-task-new-employer-action="reviewed">Marquer surveillé</button>
            <button class="btn-refuse" type="button" data-task-new-employer-action="dismissed">Ignorer</button>
          `;
        } else if (row.task_type === "duplicate_invitation_followup") {
          const duplicate = row.duplicate_followup || {};
          body = `
            <div class="compare-grid">
              <section class="compare-card">
                <h3>Invitation actuelle</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Adresse</dt><dd>${esc(duplicate.email || "-")}</dd></div>
                  <div class="detail-row"><dt>Type</dt><dd>${esc(duplicate.role === "employer" ? "Employeur" : "Candidat")}</dd></div>
                  <div class="detail-row"><dt>Structure</dt><dd>${esc(duplicate.company_name || "-")}</dd></div>
                </dl>
              </section>
              <section class="compare-card">
                <h3>Conflit détecté</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Nature</dt><dd>${esc(duplicate.duplicate_followup_type === "existing_questionnaire" ? "Questionnaire déjà reçu" : "Invitation déjà envoyée")}</dd></div>
                  <div class="detail-row"><dt>Record cible</dt><dd>${esc(duplicate.duplicate_followup_target_record_id || "-")}</dd></div>
                  <div class="detail-row"><dt>Statut cible</dt><dd>${esc(invitationStatusLabel(duplicate.duplicate_followup_target_status || "-"))}</dd></div>
                  <div class="detail-row"><dt>Message</dt><dd>${esc(duplicate.duplicate_followup_message || "-")}</dd></div>
                </dl>
              </section>
            </div>
          `;
          actions = `
            ${duplicate.can_remind ? `<button class="btn-accept" type="button" data-task-duplicate-action="remind">Envoyer la relance</button>` : ""}
            <button class="btn-refuse" type="button" data-task-delete-duplicate>Supprimer le doublon</button>
            <button class="btn-refuse" type="button" data-task-duplicate-action="ignore">Ignorer</button>
          `;
        }

        return `
          <article class="matching-card" data-task-type="${esc(row.task_type)}" data-record-id="${esc(row.record_id)}">
            <div class="matching-summary">
              <div>
                <div class="task-type-label">${esc(taskTypeLabel(row.task_type))}</div>
                <h2>${esc(row.title || "-")}</h2>
                <p>${esc(row.subtitle || "-")}</p>
                <div class="summary-tags">
                  <span class="pill ${statusClass}">Statut : ${esc(taskStatusLabel(row.status))}</span>
                  <span class="pill">${esc(priorityLabel)}</span>
                  <span class="pill">Créé le : ${esc(row.created_at || "-")}</span>
                </div>
              </div>
            </div>
            <div class="matching-body">
              <p style="margin:0; line-height:1.7;">${esc(row.summary || "-")}</p>
              ${body}
              <section class="notes-box">
                <h4>${row.task_type === "no_match_followup" ? "Commentaire à ajouter au mail" : "Note admin"}</h4>
                <textarea id="${esc(noteId)}" placeholder="${row.task_type === "no_match_followup" ? "Optionnel. Ce texte sera ajouté au mail envoyé au destinataire." : "Ajouter une note interne..."}">${esc(row.matching?.admin_decision_note || row.no_match?.note || row.new_job?.note || row.new_employer?.note || row.duplicate_followup?.duplicate_followup_note || "")}</textarea>
                ${row.task_type === "matching_review" ? `
                <div class="notes-grid" style="margin-top:0.9rem;">
                  <section class="notes-box" style="margin:0;">
                    <h4>Commentaire employeur</h4>
                    <textarea id="task-employer-comment-matching_review-${esc(row.record_id)}" placeholder="Optionnel. Ajouté uniquement au mail employeur.">${esc(row.matching?.employer_email_comment || "")}</textarea>
                  </section>
                  <section class="notes-box" style="margin:0;">
                    <h4>Commentaire candidat</h4>
                    <textarea id="task-candidate-comment-matching_review-${esc(row.record_id)}" placeholder="Optionnel. Ajouté uniquement au mail candidat.">${esc(row.matching?.candidate_email_comment || "")}</textarea>
                  </section>
                </div>` : ""}
                <div class="hero-actions">${actions}</div>
              </section>
            </div>
          </article>
        `;
      }).join("");

      for (const button of list.querySelectorAll("[data-task-matching-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const decision = event.currentTarget.dataset.taskMatchingAction;
          const note = document.getElementById(`task-note-matching_review-${recordId}`)?.value || "";
          const employerEmailComment = document.getElementById(`task-employer-comment-matching_review-${recordId}`)?.value || "";
          const candidateEmailComment = document.getElementById(`task-candidate-comment-matching_review-${recordId}`)?.value || "";
          if (!recordId || !decision) return;
          const sendEmails = event.currentTarget.dataset.sendEmails !== "false";
          await submitDecision(recordId, decision, note, employerEmailComment, candidateEmailComment, sendEmails);
          await loadTasks();
          await loadCockpit();
        });
      }
      for (const button of list.querySelectorAll("[data-borderline-send-matching]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const noMatchRecordId = card?.dataset.recordId;
          const matchingRecordId = event.currentTarget.dataset.borderlineSendMatching;
          const note = document.getElementById(`task-note-no_match_followup-${noMatchRecordId}`)?.value || "";
          if (!noMatchRecordId || !matchingRecordId) return;
          const sent = await submitDecision(matchingRecordId, "accepted", note, "", "", true);
          if (sent) {
            await submitNoMatchDismiss("candidate", noMatchRecordId, "Matching limite envoyé à l’employeur.");
          }
          await loadTasks();
          await loadCockpit();
        });
      }
      for (const button of list.querySelectorAll("[data-task-no-match-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const role = event.currentTarget.dataset.role;
          const action = event.currentTarget.dataset.taskNoMatchAction;
          const note = document.getElementById(`task-note-no_match_followup-${recordId}`)?.value || "";
          if (!recordId || !role || !action) return;
          if (action === "send") {
            await submitNoMatchSend(role, recordId, note);
          } else {
            await submitNoMatchDismiss(role, recordId, note);
          }
          await loadTasks();
          await loadCockpit();
        });
      }
      for (const button of list.querySelectorAll("[data-task-new-job-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const status = event.currentTarget.dataset.taskNewJobAction;
          const note = document.getElementById(`task-note-new_job_request-${recordId}`)?.value || "";
          if (!recordId || !status) return;
          await submitNewJobStatus(recordId, status, note);
          await loadTasks();
          await loadCockpit();
        });
      }
      for (const button of list.querySelectorAll("[data-task-new-employer-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const status = event.currentTarget.dataset.taskNewEmployerAction;
          const note = document.getElementById(`task-note-new_employer_alert-${recordId}`)?.value || "";
          if (!recordId || !status) return;
          await submitNewEmployerAlertStatus(recordId, status, note);
          await loadTasks();
          await loadCockpit();
        });
      }
      for (const button of list.querySelectorAll("[data-task-duplicate-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const action = event.currentTarget.dataset.taskDuplicateAction;
          const note = document.getElementById(`task-note-duplicate_invitation_followup-${recordId}`)?.value || "";
          if (!recordId || !action) return;
          await submitDuplicateFollowup(recordId, action, note);
        });
      }
      for (const button of list.querySelectorAll("[data-task-delete-duplicate]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          if (!recordId) return;
          await deleteInvitationError(recordId, "duplicate");
          await loadTasks();
          await loadCockpit();
        });
      }
    }

    function renderMatchingRows() {
      const list = document.getElementById("matching-list");
      const search = normalizeText(document.getElementById("filter-search").value.trim());
      const statusFilter = document.getElementById("filter-status").value;
      const sourceFilter = document.getElementById("filter-source").value;
      const filtered = state.matchings.rows.filter((row) => {
        if (!matchesSearch(row, search)) {
          return false;
        }
        if (statusFilter === "employer_responded") {
          return String(row.employer_response || "").trim() && row.workflow_status === "accepte_employeur";
        }
        const isManual = String(row.manual_matching_source || "").trim().toLowerCase() === "admin_manual";
        if (sourceFilter === "manual" && !isManual) {
          return false;
        }
        if (sourceFilter === "auto" && isManual) {
          return false;
        }
        return true;
      });

      if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Aucun matching ne correspond aux filtres actuels.</div>`;
        return;
      }

      list.innerHTML = filtered.map((row) => {
        const reasonsHtml = bulletList(row.raisons, "Aucun point fort détaillé");
        const weaknessesHtml = bulletList(row.points_faibles, "Aucun point faible majeur détecté");
        const employerSector = row.employeur?.poste || "";
        const employerJobTitle = row.employeur?.intitules_poste || employerSector || "Poste non renseigné";
        const candidateSector = row.candidat?.metier || "";
        const candidateJobTitle = row.candidat?.intitules_poste || candidateSector || "Intitulé non renseigné";
        const decisionMeta = row.admin_decision_at
          ? `<div class="decision-meta">Dernière décision : <strong>${esc(adminStatusLabel(row.admin_status))}</strong><br>Par : ${esc(row.admin_decision_by || "-")}<br>Le : ${esc(row.admin_decision_at || "-")}<br>Note : ${esc(row.admin_decision_note || "-")}</div>`
          : "";
        const employerMeta = row.employer_response
          ? `<div class="decision-meta">Retour employeur : <strong>${esc(employerResponseLabel(row.employer_response))}</strong><br>Le : ${esc(row.employer_response_at || "-")}</div>`
          : `<div class="decision-meta">Retour employeur : <strong>aucun retour</strong></div>`;
        const workflowMeta = `<div class="decision-meta">Workflow : <strong>${esc(workflowStatusLabel(row.workflow_status))}</strong><br>Maj : ${esc(row.workflow_status_updated_at || "-")}<br>Par : ${esc(row.workflow_status_updated_by || "-")}</div>`;
        const primaryActionsHtml = row.workflow_status === "accepte_employeur"
          ? `<button class="btn-neutral" type="button" data-workflow="mise_en_relation_faite">Mise en relation faite</button>`
          : `<button class="btn-accept" type="button" data-action="accepted">Accepter</button>
             <button class="btn-refuse" type="button" data-action="refused">Refuser</button>`;
        const workflowStatus = String(row.workflow_status || "").trim().toLowerCase();
        const adminStatus = String(row.admin_status || "").trim().toLowerCase();
        const terminalWorkflowStatuses = new Set([
          "envoye_employeur",
          "accepte_employeur",
          "refuse_employeur",
          "mise_en_relation_faite",
          "embauche_confirmee",
          "relation_terminee",
          "refuse_admin",
        ]);
        const alreadyValidated = adminStatus === "accepted" || workflowStatus === "valide_admin";
        const rowActionsHtml = terminalWorkflowStatuses.has(workflowStatus)
          ? ""
          : alreadyValidated
            ? `<button class="btn-accept" type="button" data-action="accepted">Envoyer les mails employeur + candidat</button>
               <button class="btn-refuse" type="button" data-action="refused">Refuser</button>`
            : `<button class="btn-accept" type="button" data-action="accepted">Accepter + envoyer</button>
               <button class="btn-refuse" type="button" data-action="refused">Refuser</button>`;

        return `
          <details class="matching-card matching-compact-card" data-record-id="${esc(row.record_id)}">
            <summary>
              <div class="matching-row">
                <div class="matching-row-cell">
                  <div class="matching-row-label">Candidat</div>
                  <div class="matching-row-main">${esc(row.candidat?.nom || "Candidat non renseigné")}</div>
                  <div class="matching-row-sub">${esc(row.candidat?.email || row.candidat_id || "-")}</div>
                </div>
                <div class="matching-row-cell">
                  <div class="matching-row-label">Employeur</div>
                  <div class="matching-row-main">${esc(row.employeur?.employeur || "Entreprise non renseignée")}</div>
                  <div class="matching-row-sub">${esc(row.employeur?.pays || "Lieu non renseigné")}</div>
                </div>
                <div class="matching-row-cell">
                  <div class="matching-row-label">Poste</div>
                  <div class="matching-row-main">${esc(employerJobTitle)}</div>
                  <div class="matching-row-sub">${esc(`${employerSector ? `Secteur : ${employerSector}` : "Secteur non renseigné"}${row.employeur?.date_debut ? ` · Début : ${row.employeur.date_debut}` : ""}`)}</div>
                </div>
                <div class="matching-row-score">${esc(row.score)}<span>/ 100</span></div>
                <div class="matching-row-tags">
                  <span class="pill">Workflow : ${esc(workflowStatusLabel(row.workflow_status))}</span>
                  <span class="pill ${esc(row.admin_status)}">${esc(adminStatusLabel(row.admin_status))}</span>
                  ${employerWhatsappBadge(row)}
                </div>
                <div class="matching-row-actions">${rowActionsHtml}</div>
                <div class="matching-row-toggle">Détails</div>
              </div>
            </summary>
            <div class="matching-body">
              <div class="matching-summary">
                <div>
                  <h2>${esc(employerJobTitle)} · ${esc(row.candidat?.nom || "Candidat non renseigné")}</h2>
                  <p>${esc(row.employeur?.employeur || "Entreprise non renseignée")} · ${esc(row.employeur?.pays || "Lieu non renseigné")} · Secteur : ${esc(employerSector || "-")}</p>
                  <div class="summary-tags">
                    <span class="pill">Workflow : ${esc(workflowStatusLabel(row.workflow_status))}</span>
                    <span class="pill ${esc(row.admin_status)}">Décision admin : ${esc(adminStatusLabel(row.admin_status))}</span>
                    <span class="pill">Scoring initial : ${esc(scoreStatusLabel(row))}</span>
                    <span class="pill ${row.employer_response === "contact" ? "response-yes" : row.employer_response === "not_contact" ? "response-no" : ""}">Employeur : ${esc(employerResponseLabel(row.employer_response))}</span>
                    ${employerWhatsappBadge(row)}
                    <span class="pill">besoin_id : ${esc(row.besoin_id)}</span>
                    <span class="pill">candidat_id : ${esc(row.candidat_id)}</span>
                  </div>
                </div>

                <div class="summary-score">
                  <div class="score-box">
                    <strong>${esc(row.score)}</strong>
                    <span>score global / 100</span>
                  </div>
                  <div class="decision-actions">
                    ${primaryActionsHtml}
                  </div>
                </div>
              </div>

              ${renderMatchingNextAction(row)}

              <div class="compare-grid">
                <section class="compare-card">
                  <h3>Candidat</h3>
                  <div class="profile-section">
                    <section class="profile-block">
                      <h4>Identité et contact</h4>
                      <div class="key-value">
                        <div class="key-value-row"><span>Nom</span><span>${esc(row.candidat?.nom || "-")}</span></div>
                        <div class="key-value-row"><span>Email</span><span>${esc(row.candidat?.email || "-")}</span></div>
                        <div class="key-value-row"><span>Téléphone</span><span>${esc(row.candidat?.telephone || "-")}</span></div>
                        <div class="key-value-row"><span>Pays</span><span>${esc(row.candidat?.pays || "-")}</span></div>
                      </div>
                    </section>
                    <section class="profile-block job-highlight">
                      <h4>Projet métier</h4>
                      <div class="key-value">
                        <div class="key-value-row"><span>Secteur</span><span>${esc(candidateSector || "-")}</span></div>
                        <div class="key-value-row"><span>Intitulé visé</span><span>${esc(candidateJobTitle)}</span></div>
                        <div class="key-value-row"><span>Compétences</span><span>${esc(row.candidat?.competences || "-")}</span></div>
                      </div>
                    </section>
                    <section class="profile-block">
                      <h4>Conditions de disponibilité</h4>
                      <div class="key-value">
                        <div class="key-value-row"><span>Langues</span><span>${esc(row.candidat?.langues || "-")}</span></div>
                        <div class="key-value-row"><span>Mobilité</span><span>${esc(row.candidat?.mobilite || "-")}</span></div>
                        <div class="key-value-row"><span>Disponibilité</span><span>${esc(row.candidat?.disponibilite || "-")}</span></div>
                      </div>
                    </section>
                  </div>
                </section>

                <section class="compare-card">
                  <h3>Employeur / besoin</h3>
                  <div class="profile-section">
                    <section class="profile-block">
                      <h4>Entreprise et contact</h4>
                      <div class="key-value">
                        <div class="key-value-row"><span>Entreprise</span><span>${esc(row.employeur?.employeur || "-")}</span></div>
                        <div class="key-value-row"><span>Contact</span><span>${esc(row.employeur?.contact || "-")}</span></div>
                        <div class="key-value-row"><span>Email</span><span>${esc(row.employeur?.email || "-")}</span></div>
                        <div class="key-value-row"><span>Téléphone</span><span>${esc(row.employer_whatsapp_phone || row.employeur?.telephone || "-")}</span></div>
                      </div>
                    </section>
                    <section class="profile-block job-highlight">
                      <h4>Besoin métier</h4>
                      <div class="key-value">
                        <div class="key-value-row"><span>Secteur</span><span>${esc(employerSector || "-")}</span></div>
                        <div class="key-value-row"><span>Intitulé</span><span>${esc(employerJobTitle)}</span></div>
                        <div class="key-value-row"><span>Compétences clés</span><span>${esc(row.employeur?.competences_clefs || "-")}</span></div>
                      </div>
                    </section>
                    <section class="profile-block">
                      <h4>Conditions du besoin</h4>
                      <div class="key-value">
                        <div class="key-value-row"><span>Pays / lieu</span><span>${esc(row.employeur?.pays || "-")}</span></div>
                        <div class="key-value-row"><span>Date de début</span><span>${esc(row.employeur?.date_debut || "-")}</span></div>
                        <div class="key-value-row"><span>Langues requises</span><span>${esc(row.employeur?.langues_requises || "-")}</span></div>
                        <div class="key-value-row"><span>Contraintes</span><span>${esc(row.employeur?.contraintes_travail || "-")}</span></div>
                      </div>
                    </section>
                    <section class="profile-block">
                      <h4>Communication</h4>
                      <div class="key-value">
                        <div class="key-value-row"><span>Accord WhatsApp employeur</span><span>${esc(row.employer_whatsapp_consent === "yes" ? `Oui${row.employer_whatsapp_confirmed_at ? ` · confirmé le ${row.employer_whatsapp_confirmed_at}` : ""}` : row.employer_whatsapp_consent === "no" ? "Non" : "Non renseigné")}</span></div>
                      </div>
                    </section>
                  </div>
                </section>
              </div>

              <section class="subscores-grid">
                <div class="subscore-card"><strong>${esc(row.score_metier)}</strong><span>Métier / 25</span></div>
                <div class="subscore-card"><strong>${esc(row.score_competences ?? 0)}</strong><span>Compétences / 20</span></div>
                <div class="subscore-card"><strong>${esc(row.score_langues)}</strong><span>Langues / 20</span></div>
                <div class="subscore-card"><strong>${esc(row.score_mobilite)}</strong><span>Mobilité / 15</span></div>
                <div class="subscore-card"><strong>${esc(row.score_disponibilite)}</strong><span>Disponibilité / 10</span></div>
                <div class="subscore-card"><strong>${esc(row.score_salaire)}</strong><span>Salaire / 10</span></div>
              </section>

              <div class="notes-grid">
                <section class="notes-box">
                  <h4>Points forts</h4>
                  ${reasonsHtml}
                </section>
                <section class="notes-box">
                  <h4>Points faibles</h4>
                  ${weaknessesHtml}
                </section>
              </div>

              <section class="notes-box">
                <h4>Commentaires sortants</h4>
                <div class="notes-grid">
                  <section class="notes-box" style="margin:0;">
                    <h4>Commentaire employeur</h4>
                    <textarea id="employer-comment-${esc(row.record_id)}" placeholder="Optionnel. Ajouté uniquement au mail employeur.">${esc(row.employer_email_comment || "")}</textarea>
                  </section>
                  <section class="notes-box" style="margin:0;">
                    <h4>Commentaire candidat</h4>
                    <textarea id="candidate-comment-${esc(row.record_id)}" placeholder="Optionnel. Ajouté uniquement au mail candidat.">${esc(row.candidate_email_comment || "")}</textarea>
                  </section>
                </div>
                <h4 style="margin-top:1rem;">Note interne / workflow</h4>
                <textarea id="note-${esc(row.record_id)}" placeholder="Optionnel. Note interne conservée dans l’admin.">${esc(row.admin_decision_note || "")}</textarea>
                <div class="hero-actions">
                  <button class="btn-neutral" type="button" data-action="accepted">Enregistrer comme accepté</button>
                  <button class="btn-refuse" type="button" data-action="refused">Enregistrer comme refusé</button>
                  <button class="btn-neutral" type="button" data-workflow="mise_en_relation_faite">Mise en relation faite</button>
                  <button class="btn-neutral" type="button" data-workflow="embauche_confirmee">Embauche confirmée</button>
                </div>
                ${decisionMeta}
                ${workflowMeta}
                ${employerMeta}
              </section>
            </div>
          </details>
        `;
      }).join("");

      for (const button of list.querySelectorAll("[data-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const decision = event.currentTarget.dataset.action;
          const note = document.getElementById(`note-${recordId}`)?.value || "";
          const employerEmailComment = document.getElementById(`employer-comment-${recordId}`)?.value || "";
          const candidateEmailComment = document.getElementById(`candidate-comment-${recordId}`)?.value || "";
          if (!recordId || !decision) return;
          await submitDecision(recordId, decision, note, employerEmailComment, candidateEmailComment);
        });
      }
      for (const button of list.querySelectorAll("[data-workflow]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const workflowStatus = event.currentTarget.dataset.workflow;
          const note = document.getElementById(`note-${recordId}`)?.value || "";
          if (!recordId || !workflowStatus) return;
          await submitWorkflow(recordId, workflowStatus, note);
        });
      }
    }

    function renderNoMatchRows() {
      const list = document.getElementById("no-match-list");
      const search = normalizeText(document.getElementById("no-match-filter-search").value.trim());
      const filtered = state.noMatch.rows.filter((row) => noMatchSearch(row, search));

      if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Aucune entrée ne correspond aux filtres actuels.</div>`;
        return;
      }

      list.innerHTML = filtered.map((row) => {
        const payload = row.payload || {};
        const note = row.note || "";
        const isCandidate = row.role === "candidate";
        const roleLabel = isCandidate ? "candidat" : "employeur";
        const borderlineMatchings = Array.isArray(row.borderline_matchings) ? row.borderline_matchings : [];
        const borderlineBlock = isCandidate && borderlineMatchings.length ? `
          <section class="compare-card" style="margin-top:1rem;">
            <h3>Matchings à la limite</h3>
            <p style="margin:0 0 0.75rem; line-height:1.6;">
              Aucun matching automatiquement exploitable n’a été trouvé. Ces rapprochements sont proches du seuil et peuvent être réexaminés manuellement.
            </p>
            <div class="linked-matching-list">
              ${borderlineMatchings.map((matching) => {
                const title = [
                  shortBusinessLabel(matching.employeur || ""),
                  shortBusinessLabel(matching.poste || matching.secteur || ""),
                  shortBusinessLabel(matching.pays || "")
                ].filter(Boolean).join(" · ");
                const weaknesses = Array.isArray(matching.points_faibles) ? matching.points_faibles : [];
                const reasons = Array.isArray(matching.raisons) ? matching.raisons : [];
                const explanation = weaknesses.length ? weaknesses : reasons;
                return `
                  <div class="linked-matching-row">
                    <div>
                      <strong>${esc(title || "Rapprochement à examiner")}</strong>
                      ${explanation.length ? `<p>${esc(explanation.slice(0, 2).join(" · "))}</p>` : ""}
                    </div>
                    <div class="decision-actions" style="margin-left:auto;">
                      <span class="pill pending">Score : ${esc(matching.score ?? "-")}/100</span>
                      <button class="btn-accept" type="button" data-borderline-send-matching="${esc(matching.record_id)}">Envoyer ce matching</button>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </section>
        ` : "";
        const details = isCandidate ? `
          <div class="compare-grid">
            <section class="compare-card">
              <h3>Candidat</h3>
              <dl class="detail-list">
                <div class="detail-row"><dt>Nom</dt><dd>${esc(payload.nom || "-")}</dd></div>
                <div class="detail-row"><dt>Email</dt><dd>${esc(payload.email || "-")}</dd></div>
                <div class="detail-row"><dt>Pays</dt><dd>${esc(payload.pays || "-")}</dd></div>
                <div class="detail-row"><dt>Secteur / métier</dt><dd>${esc(payload.metier || "-")}</dd></div>
                <div class="detail-row"><dt>Langues</dt><dd>${esc(payload.langues || "-")}</dd></div>
                <div class="detail-row"><dt>Mobilité</dt><dd>${esc(payload.mobilite || "-")}</dd></div>
                <div class="detail-row"><dt>Disponibilité</dt><dd>${esc(payload.disponibilite || "-")}</dd></div>
              </dl>
            </section>
            <section class="compare-card">
              <h3>Action attendue</h3>
              <p style="margin:0 0 0.7rem; line-height:1.7;">Répondre au candidat pour indiquer qu’aucun matching immédiat n’a été trouvé.</p>
              <p style="margin:0; line-height:1.7;">Le commentaire saisi plus bas sera ajouté au mail si vous cliquez sur “Envoyer l’email”.</p>
            </section>
          </div>
          ${borderlineBlock}
        ` : `
          <div class="compare-grid">
            <section class="compare-card">
              <h3>Employeur / besoin</h3>
              <dl class="detail-list">
                <div class="detail-row"><dt>Entreprise</dt><dd>${esc(payload.employeur || "-")}</dd></div>
                <div class="detail-row"><dt>Contact</dt><dd>${esc(payload.contact || "-")}</dd></div>
                <div class="detail-row"><dt>Intitulé du poste</dt><dd>${esc(payload.poste || "-")}</dd></div>
                <div class="detail-row"><dt>Pays</dt><dd>${esc(payload.pays || "-")}</dd></div>
                <div class="detail-row"><dt>Langues requises</dt><dd>${esc(payload.langues_requises || "-")}</dd></div>
                <div class="detail-row"><dt>Date de début</dt><dd>${esc(payload.date_debut || "-")}</dd></div>
              </dl>
            </section>
            <section class="compare-card">
              <h3>Action attendue</h3>
              <p style="margin:0 0 0.7rem; line-height:1.7;">Répondre à l’employeur pour indiquer qu’aucun matching immédiat n’a été généré.</p>
              <p style="margin:0; line-height:1.7;">Le commentaire saisi plus bas sera ajouté au mail si vous cliquez sur “Envoyer l’email”.</p>
            </section>
          </div>
        `;

        return `
          <article class="matching-card" data-role="${esc(row.role)}" data-record-id="${esc(row.record_id)}">
            <div class="matching-summary">
              <div>
                <h2>${esc(row.title || (isCandidate ? "Candidat" : "Employeur"))}</h2>
                <p>${esc((isCandidate ? "Candidat" : "Employeur") + (row.subtitle ? ` · ${row.subtitle}` : ""))}</p>
                <div class="summary-tags">
                  <span class="pill ${isCandidate ? "role-candidate" : "role-employer"}">${esc(isCandidate ? "Candidat" : "Employeur")}</span>
                  <span class="pill ${row.notification_status === "sent" ? "accepted" : row.notification_status === "dismissed" ? "refused" : "pending"}">Statut : ${esc(noMatchStatusLabel(row.notification_status))}</span>
                  <span class="pill">Destinataire : ${esc(row.recipient_email || "email manquant")}</span>
                </div>
              </div>

              <div class="summary-score">
                <div class="score-box">
                  <strong>${esc(row.notification_status === "sent" ? "OK" : row.notification_status === "dismissed" ? "N/A" : "0")}</strong>
                  <span>matching immédiat</span>
                </div>
                <div class="decision-actions">
                  <button class="btn-accept" type="button" data-no-match-action="send">Envoyer l’email avec ce commentaire</button>
                  <button class="btn-refuse" type="button" data-no-match-action="dismiss">Traiter sans envoyer</button>
                </div>
              </div>
            </div>

            <div class="matching-body">
              ${details}
              <section class="notes-box">
                <h4>Commentaire à ajouter au mail</h4>
                <textarea id="no-match-note-${esc(row.role)}-${esc(row.record_id)}" placeholder="Optionnel. Ce texte sera ajouté au mail envoyé au ${esc(roleLabel)}.">${esc(note)}</textarea>
                <div class="decision-meta">Créé le : ${esc(row.created_at || "-")}<br>Par : ${esc(row.created_by || "-")}<br>Dernier envoi : ${esc(row.sent_at || "-")}</div>
              </section>
            </div>
          </article>
        `;
      }).join("");

      for (const button of list.querySelectorAll("[data-borderline-send-matching]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const noMatchRecordId = card?.dataset.recordId;
          const role = card?.dataset.role || "candidate";
          const matchingRecordId = event.currentTarget.dataset.borderlineSendMatching;
          const note = document.getElementById(`no-match-note-${role}-${noMatchRecordId}`)?.value || "";
          if (!noMatchRecordId || !matchingRecordId || !role) return;
          const sent = await submitDecision(matchingRecordId, "accepted", note, "", "", true);
          if (sent) {
            await submitNoMatchDismiss(role, noMatchRecordId, "Matching limite envoyé à l’employeur.");
          }
          await loadNoMatch();
          await loadTasks();
          await loadCockpit();
        });
      }
      for (const button of list.querySelectorAll("[data-no-match-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const role = card?.dataset.role;
          const action = event.currentTarget.dataset.noMatchAction;
          const note = document.getElementById(`no-match-note-${role}-${recordId}`)?.value || "";
          if (!recordId || !role || !action) return;
          if (action === "send") {
            await submitNoMatchSend(role, recordId, note);
          } else {
            await submitNoMatchDismiss(role, recordId, note);
          }
        });
      }
    }

    function renderNewJobRows() {
      const list = document.getElementById("new-job-list");
      const search = normalizeText(document.getElementById("new-job-filter-search").value.trim());
      const filtered = state.newJobs.rows.filter((row) => newJobSearch(row, search));

      if (!filtered.length) {
        list.innerHTML = `<div class="empty-state">Aucune demande ne correspond aux filtres actuels.</div>`;
        return;
      }

      list.innerHTML = filtered.map((row) => `
        <article class="matching-card" data-record-id="${esc(row.record_id)}">
          <div class="matching-summary">
            <div>
              <h2>${esc(row.employeur || "Entreprise non renseignée")}</h2>
              <p>${esc(row.poste || "Poste non renseigné")} · ${esc(row.pays || "Lieu non renseigné")}</p>
              <div class="summary-tags">
                <span class="pill role-employer">Employeur</span>
                <span class="pill ${row.request_status === "processed" ? "accepted" : row.request_status === "dismissed" ? "refused" : "pending"}">Statut : ${esc(newJobStatusLabel(row.request_status))}</span>
                <span class="pill">Contact : ${esc(row.email || row.contact || "non renseigné")}</span>
              </div>
            </div>

            <div class="summary-score">
              <div class="score-box">
                <strong>+</strong>
                <span>métier demandé</span>
              </div>
              <div class="decision-actions">
                <button class="btn-accept" type="button" data-new-job-action="processed">Marquer traité</button>
                <button class="btn-refuse" type="button" data-new-job-action="dismissed">Ignorer</button>
              </div>
            </div>
          </div>

          <div class="matching-body">
            <div class="compare-grid">
              <section class="compare-card">
                <h3>Besoin employeur</h3>
                <dl class="detail-list">
                  <div class="detail-row"><dt>Entreprise</dt><dd>${esc(row.employeur || "-")}</dd></div>
                  <div class="detail-row"><dt>Contact</dt><dd>${esc(row.contact || "-")}</dd></div>
                  <div class="detail-row"><dt>Email</dt><dd>${esc(row.email || "-")}</dd></div>
                  <div class="detail-row"><dt>Poste</dt><dd>${esc(row.poste || "-")}</dd></div>
                  <div class="detail-row"><dt>Pays</dt><dd>${esc(row.pays || "-")}</dd></div>
                </dl>
              </section>

              <section class="compare-card">
                <h3>Nouveaux métiers souhaités</h3>
                <p style="margin:0; line-height:1.7;">${esc(row.requested_jobs || "-")}</p>
              </section>
            </div>

            <section class="notes-box">
              <h4>Note admin</h4>
              <textarea id="new-job-note-${esc(row.record_id)}" placeholder="Ajouter une note interne...">${esc(row.note || "")}</textarea>
              <div class="decision-meta">Créé le : ${esc(row.created_at || "-")}<br>Par : ${esc(row.created_by || "-")}<br>Traité le : ${esc(row.processed_at || "-")}<br>Par : ${esc(row.processed_by || "-")}</div>
            </section>
          </div>
        </article>
      `).join("");

      for (const button of list.querySelectorAll("[data-new-job-action]")) {
        button.addEventListener("click", async (event) => {
          const card = event.currentTarget.closest(".matching-card");
          const recordId = card?.dataset.recordId;
          const status = event.currentTarget.dataset.newJobAction;
          const note = document.getElementById(`new-job-note-${recordId}`)?.value || "";
          if (!recordId || !status) return;
          await submitNewJobStatus(recordId, status, note);
        });
      }
    }

    function displayText(value) {
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return "";
      return String(value).trim();
    }

    function renderInlineMeta(parts) {
      const values = (Array.isArray(parts) ? parts : []).map(displayText).filter(Boolean);
      return values.length ? `<p class="employer-meta">${values.map(esc).join(" · ")}</p>` : "";
    }

    function renderEmployerContact(contact, principal = false) {
      const firstName = displayText(contact?.prenom);
      const lastName = displayText(contact?.nom);
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Contact sans nom";
      const details = [contact?.fonction, contact?.email, contact?.telephone].map(displayText).filter(Boolean);
      return `
        <article class="employer-contact">
          <strong>${principal ? "Contact principal · " : ""}${esc(fullName)}</strong>
          ${details.length ? `<div>${details.map(esc).join(" · ")}</div>` : ""}
        </article>
      `;
    }

    function renderEmployerNeed(need) {
      const indicators = need?.indicators || {};
      const indicatorItems = [
        ["Identifiés", indicators.identified],
        ["Validés", indicators.validated],
        ["Présentés à l’employeur", indicators.presented],
        ["Employeur intéressé", indicators.employer_interested],
        ["Mise en relation faite", indicators.introduction_done],
      ];
      return `
        <article class="employer-need">
          <h4>${esc(displayText(need?.poste) || "Besoin sans poste renseigné")}</h4>
          ${renderInlineMeta([need?.nombre_postes ? `${need.nombre_postes} poste(s)` : "", need?.lieu_travail_normalise])}
          <div class="employer-indicators">
            ${indicatorItems.map(([label, value]) => `
              <div class="employer-indicator">
                <strong>${esc(Number.isFinite(Number(value)) ? Number(value) : 0)}</strong>
                <span>${esc(label)}</span>
              </div>
            `).join("")}
          </div>
        </article>
      `;
    }

    function renderEmployers() {
      const list = document.getElementById("employer-registry-list");
      const rows = Array.isArray(state.employers.rows) ? state.employers.rows : [];
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state">Aucune entreprise chargée.</div>`;
        return;
      }
      list.innerHTML = rows.map((employer) => {
        const contacts = Array.isArray(employer.contacts) ? employer.contacts : [];
        const principalId = displayText(employer.contact_principal?.contact_id);
        const otherContacts = contacts.filter((contact) => displayText(contact?.contact_id) !== principalId);
        const besoins = Array.isArray(employer.besoins) ? employer.besoins : [];
        return `
          <article class="admin-card employer-card">
            <header>
              <h3>${esc(displayText(employer.nom) || "Entreprise sans nom")}</h3>
              ${renderInlineMeta([employer.pays, employer.ville_ou_lieu, employer.secteurs, employer.statut])}
            </header>
            <div class="employer-sections">
              <section>
                <p class="employer-section-title">Contacts</p>
                <div class="employer-contact-list">
                  ${employer.contact_principal ? renderEmployerContact(employer.contact_principal, true) : ""}
                  ${otherContacts.map((contact) => renderEmployerContact(contact)).join("")}
                  ${(!employer.contact_principal && !otherContacts.length) ? `<div class="empty-state">Aucun contact renseigné.</div>` : ""}
                </div>
              </section>
              <section>
                <p class="employer-section-title">Besoins</p>
                <div class="employer-need-list">
                  ${besoins.length ? besoins.map(renderEmployerNeed).join("") : `<div class="empty-state">Aucun besoin rattaché.</div>`}
                </div>
              </section>
            </div>
          </article>
        `;
      }).join("");
    }

    async function loadEmployers() {
      if (state.employers.loading) return;
      state.employers.loading = true;
      setStatus("employer-registry-status-line", "Chargement des employeurs...");
      try {
        const response = await fetch(apiUrl("/admin/employers"), { credentials: "same-origin", headers: { "Accept": "application/json" } });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        state.employers.rows = Array.isArray(payload.rows) ? payload.rows : [];
        state.employers.loaded = true;
        renderEmployers();
        setStatus("employer-registry-status-line", `${state.employers.rows.length} entreprise(s) chargée(s).`);
      } catch (error) {
        state.employers.rows = [];
        document.getElementById("employer-registry-list").innerHTML = `<div class="empty-state">${esc(error.message || "Erreur de chargement")}</div>`;
        setStatus("employer-registry-status-line", "Erreur de chargement des employeurs.");
      } finally {
        state.employers.loading = false;
      }
    }

    async function loadMatchings() {
      if (state.matchings.loading) return;
      state.matchings.loading = true;
      setStatus("status-line", "Chargement des matchings...");

      const status = document.getElementById("filter-status").value;
      const url = new URL(apiUrl("/admin/matchings"), window.location.origin);
      if (status && status !== "employer_responded") url.searchParams.set("status", status);

      try {
        const response = await fetch(url.toString(), { credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }

        state.matchings.rows = Array.isArray(payload.rows) ? payload.rows : [];
        document.getElementById("kpi-total").textContent = payload.stats?.total ?? 0;
        document.getElementById("kpi-pending").textContent = payload.stats?.pending ?? 0;
        document.getElementById("kpi-accepted").textContent = payload.stats?.accepted ?? 0;
        document.getElementById("kpi-refused").textContent = payload.stats?.refused ?? 0;
        setTaskMenuCount("matchings-pending", payload.stats?.pending ?? 0);
        if (status === "employer_responded") {
          const actionableEmployerResponses = state.matchings.rows.filter((row) => (
            String(row.employer_response || "").trim() && row.workflow_status === "accepte_employeur"
          )).length;
          setTaskMenuCount("matchings-employer-responded", actionableEmployerResponses);
        }
        renderMatchingRows();
        renderDataHistoryView();
        setStatus("status-line", `${state.matchings.rows.length} matching(s) chargés.`);
      } catch (error) {
        document.getElementById("matching-list").innerHTML = `<div class="empty-state">${esc(error.message || "Erreur de chargement")}</div>`;
        setStatus("status-line", `Erreur : ${error.message || "chargement impossible"}`);
      } finally {
        state.matchings.loading = false;
      }
    }

    async function loadBrevoHealth() {
      try {
        const response = await fetch(`${apiUrl("/admin/brevo-health")}?check=1`, { credentials: "same-origin" });
        const payload = await response.json();
        const health = payload?.brevo || null;
        state.brevo = health;
        renderBrevoStatus(health);
        if (state.cockpit.data && document.getElementById("cockpit-grid")) {
          renderCockpit();
        }
      } catch (error) {
        setStatus("brevo-status-line", `Brevo : vérification impossible. ${error.message || "erreur réseau"}`);
      }
    }

    async function loadVisitAnalytics() {
      setStatus("visit-analytics-status-line", "Chargement des visites...");
      try {
        const response = await fetch(`${apiUrl("/admin/visit-analytics")}?days=30`, { credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        state.visitAnalytics = payload;
        renderVisitAnalyticsSummary(payload);
      } catch (error) {
        setStatus("visit-analytics-status-line", `Erreur : ${error.message || "chargement impossible"}`);
      }
    }

    async function loadNoMatch() {
      if (state.noMatch.loading) return;
      state.noMatch.loading = true;
      setStatus("no-match-status-line", "Chargement des entrées sans matching...");

      const status = document.getElementById("no-match-filter-status").value;
      const url = new URL(apiUrl("/admin/no-match"), window.location.origin);
      if (status) url.searchParams.set("status", status);

      try {
        const response = await fetch(url.toString(), { credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        state.noMatch.rows = Array.isArray(payload.rows) ? payload.rows : [];
        document.getElementById("no-match-kpi-total").textContent = payload.stats?.total ?? 0;
        document.getElementById("no-match-kpi-pending").textContent = payload.stats?.pending ?? 0;
        document.getElementById("no-match-kpi-sent").textContent = payload.stats?.sent ?? 0;
        document.getElementById("no-match-kpi-dismissed").textContent = payload.stats?.dismissed ?? 0;
        setTaskMenuCount("no-match", payload.stats?.pending ?? 0);
        renderNoMatchRows();
        setStatus("no-match-status-line", `${state.noMatch.rows.length} entrée(s) chargée(s).`);
      } catch (error) {
        document.getElementById("no-match-list").innerHTML = `<div class="empty-state">${esc(error.message || "Erreur de chargement")}</div>`;
        setStatus("no-match-status-line", `Erreur : ${error.message || "chargement impossible"}`);
      } finally {
        state.noMatch.loading = false;
      }
    }

    async function loadNewJobs() {
      if (state.newJobs.loading) return;
      state.newJobs.loading = true;
      setStatus("new-job-status-line", "Chargement des demandes de nouveaux métiers...");

      const status = document.getElementById("new-job-filter-status").value;
      const url = new URL(apiUrl("/admin/new-job-requests"), window.location.origin);
      if (status) url.searchParams.set("status", status);

      try {
        const response = await fetch(url.toString(), { credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        state.newJobs.rows = Array.isArray(payload.rows) ? payload.rows : [];
        document.getElementById("new-job-kpi-total").textContent = payload.stats?.total ?? 0;
        document.getElementById("new-job-kpi-pending").textContent = payload.stats?.pending ?? 0;
        document.getElementById("new-job-kpi-processed").textContent = payload.stats?.processed ?? 0;
        document.getElementById("new-job-kpi-dismissed").textContent = payload.stats?.dismissed ?? 0;
        setTaskMenuCount("new-jobs", payload.stats?.pending ?? 0);
        renderNewJobRows();
        setStatus("new-job-status-line", `${state.newJobs.rows.length} demande(s) chargée(s).`);
      } catch (error) {
        document.getElementById("new-job-list").innerHTML = `<div class="empty-state">${esc(error.message || "Erreur de chargement")}</div>`;
        setStatus("new-job-status-line", `Erreur : ${error.message || "chargement impossible"}`);
      } finally {
        state.newJobs.loading = false;
      }
    }

    async function submitDecision(recordId, decision, note, employerEmailComment = "", candidateEmailComment = "", sendEmails = true) {
      const emailMode = decision === "accepted" ? (sendEmails ? " avec envoi des mails" : " sans envoi des mails") : "";
      setStatus("status-line", `Enregistrement de la décision ${decision}${emailMode}...`);
      try {
        const response = await fetch(apiUrl(`/admin/matchings/${recordId}/decision`), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ decision, note, employer_email_comment: employerEmailComment, candidate_email_comment: candidateEmailComment, send_emails: sendEmails }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus("status-line", `Décision enregistrée : ${decision}${payload.email_sent ? " ; mails envoyés." : "."}`);
        await loadMatchings();
        await loadTasks();
        await loadCockpit();
        return true;
      } catch (error) {
        setStatus("status-line", `Erreur : ${error.message || "mise à jour impossible"}`);
        return false;
      }
    }

    async function submitWorkflow(recordId, workflowStatus, note, extraPayload = {}) {
      setStatus("status-line", `Mise à jour du workflow ${workflowStatus}...`);
      try {
        const response = await fetch(apiUrl(`/admin/matchings/${recordId}/workflow`), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ workflow_status: workflowStatus, note, ...extraPayload }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus("status-line", `Workflow enregistré : ${workflowStatusLabel(payload.workflow_status)}.`);
        await loadMatchings();
      } catch (error) {
        setStatus("status-line", `Erreur : ${error.message || "mise à jour impossible"}`);
      }
    }

    async function submitNoMatchSend(role, recordId, note) {
      setStatus("no-match-status-line", "Envoi de l’email en cours...");
      try {
        const response = await fetch(apiUrl(`/admin/no-match/${role}/${recordId}/send`), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ note }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus("no-match-status-line", `Email envoyé à ${payload.email || "le destinataire"}.`);
        await loadNoMatch();
        await loadTasks();
        await loadCockpit();
      } catch (error) {
        setStatus("no-match-status-line", `Erreur : ${error.message || "envoi impossible"}`);
      }
    }

    async function submitNoMatchDismiss(role, recordId, note) {
      setStatus("no-match-status-line", "Mise à jour en cours...");
      try {
        const response = await fetch(apiUrl(`/admin/no-match/${role}/${recordId}/dismiss`), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ note }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus("no-match-status-line", "Entrée ignorée.");
        await loadNoMatch();
        await loadTasks();
        await loadCockpit();
      } catch (error) {
        setStatus("no-match-status-line", `Erreur : ${error.message || "mise à jour impossible"}`);
      }
    }

    async function submitNewJobStatus(recordId, status, note) {
      setStatus("new-job-status-line", "Mise à jour en cours...");
      try {
        const response = await fetch(apiUrl(`/admin/new-job-requests/${recordId}/status`), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ status, note }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus("new-job-status-line", `Demande marquée comme ${newJobStatusLabel(payload.status)}.`);
        await loadNewJobs();
        await loadTasks();
        await loadCockpit();
      } catch (error) {
        setStatus("new-job-status-line", `Erreur : ${error.message || "mise à jour impossible"}`);
      }
    }

    async function submitNewEmployerAlertStatus(recordId, status, note) {
      setStatus("task-status-line", "Mise à jour en cours...");
      try {
        const response = await fetch(apiUrl(`/admin/new-employer-alerts/${recordId}/status`), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ status, note }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `Erreur API (${response.status})`);
        }
        setStatus("task-status-line", `Alerte nouvel employeur marquée comme ${status === "reviewed" ? "surveillée" : "ignorée"}.`);
      } catch (error) {
        setStatus("task-status-line", `Erreur : ${error.message || "mise à jour impossible"}`);
      }
    }

    function activateTab(tabName) {
      state.activeTab = tabName;
      const mainTabMap = {
        matchings: "tasks",
        "no-match": "tasks",
        "new-jobs": "tasks",
        "candidate-responses": "data-history",
        "employer-responses": "data-history",
      };
      const activeMainTab = mainTabMap[tabName] || tabName;
      document.getElementById("panel-cockpit").hidden = tabName !== "cockpit";
      document.getElementById("panel-tasks").hidden = tabName !== "tasks";
      document.getElementById("panel-invitations").hidden = tabName !== "invitations";
      document.getElementById("panel-relations").hidden = tabName !== "relations";
      document.getElementById("panel-employers").hidden = tabName !== "employers";
      document.getElementById("panel-candidate-responses").hidden = tabName !== "candidate-responses";
      document.getElementById("panel-employer-responses").hidden = tabName !== "employer-responses";
      document.getElementById("panel-matchings").hidden = tabName !== "matchings";
      document.getElementById("panel-data-history").hidden = tabName !== "data-history";
      document.getElementById("panel-no-match").hidden = tabName !== "no-match";
      document.getElementById("panel-new-jobs").hidden = tabName !== "new-jobs";
      for (const button of document.querySelectorAll("[data-tab]")) {
        button.classList.toggle("active", button.dataset.tab === activeMainTab);
      }
      for (const button of document.querySelectorAll(".admin-side-nav button")) {
        const target = button.dataset.openList || button.dataset.openAdminData || button.dataset.openHistory || "";
        const isActive =
          (tabName === "tasks" && target === "tasks") ||
          (tabName === "invitations" && invitationViewTarget(target) === state.invitations.view) ||
          (tabName === "relations" && relationViewTarget(button.dataset.openRelations || target) === state.relationsView) ||
          (tabName === "cockpit" && target.startsWith("technical-") && technicalViewByTarget[target] === state.technicalView) ||
          (tabName === "data-history" && dataHistoryViewTarget(target) === state.dataHistoryView) ||
          (tabName === "matchings" && matchingViewTarget(target) === state.matchings.view) ||
          (tabName === "no-match" && target === "no-match") ||
          (tabName === "new-jobs" && target === "new-jobs") ||
          (tabName === "candidate-responses" && target === "candidate-responses") ||
          (tabName === "employer-responses" && target === "employer-responses");
        button.classList.toggle("active", isActive);
      }
      updateTaskMenuBadges();
      if (tabName === "candidate-responses") {
        clearResponseWatch("candidate");
        loadQuestionnaireResponses("candidate", { clearUnseen: true });
      }
      if (tabName === "employer-responses") {
        clearResponseWatch("employer");
        loadQuestionnaireResponses("employer", { clearUnseen: true });
      }
      if (tabName === "no-match") {
        loadNoMatch();
      }
      if (tabName === "new-jobs") {
        loadNewJobs();
      }
      if (tabName === "data-history") {
        setDataHistoryView(state.dataHistoryView || "home");
      }
      if (tabName === "relations") {
        setRelationsView(state.relationsView || "to-launch");
      }
      if (tabName === "employers" && !state.employers.loaded) {
        loadEmployers();
      }
    }

    document.getElementById("single-save-btn").addEventListener("click", async () => {
      try {
        await importInvitations(buildSingleInvitationPayload(false));
      } catch (error) {
        setStatus("invite-status-line", `Erreur : ${error.message || "création impossible"}`);
      }
    });
    document.getElementById("single-save-ft-manual-btn").addEventListener("click", async () => {
      const button = document.getElementById("single-save-ft-manual-btn");
      try {
        const payload = buildSingleInvitationPayload(true);
        const savedEmail = payload.rows[0].email;
        button.disabled = true;
        setStatus("single-invitation-status-line", "Enregistrement en cours...");
        const result = await importInvitations(payload);
        const savedCount = Number(result?.created || 0) + Number(result?.updated || 0);
        if (!result) {
          setStatus("single-invitation-status-line", "Échec de l’enregistrement. Le formulaire est conservé pour permettre une nouvelle tentative.");
          return;
        }
        if (!savedCount) {
          setStatus("single-invitation-status-line", "Aucune invitation n’a été enregistrée. Le formulaire est conservé.");
          return;
        }
        resetSingleInvitationForm();
        setStatus("single-invitation-status-line", `Invitation de ${savedEmail} enregistrée comme envoyée depuis FT. Le formulaire a été remis à zéro.`);
        document.getElementById("single-email").focus();
      } catch (error) {
        setStatus("single-invitation-status-line", `Échec de l’enregistrement : ${error.message || "création impossible"}. Le formulaire est conservé.`);
        setStatus("invite-status-line", `Erreur : ${error.message || "création impossible"}`);
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById("single-role").addEventListener("change", updateSingleInvitationRoleUI);
    document.getElementById("csv-sample-btn").addEventListener("click", () => {
      document.getElementById("csv-text").value = sampleCsv();
    });
    document.getElementById("csv-import-btn").addEventListener("click", async () => {
      const csvText = document.getElementById("csv-text").value.trim();
      if (!csvText) {
        setStatus("invite-status-line", "Erreur : aucun CSV fourni.");
        return;
      }
      await importInvitations({ csv_text: csvText });
    });
    document.getElementById("send-pending-btn").addEventListener("click", async () => {
      await sendInvitations([]);
    });
    document.getElementById("send-reminders-btn").addEventListener("click", async () => {
      await sendInvitationReminders([]);
    });
    document.getElementById("toggle-selection-btn").addEventListener("click", () => {
      state.invitations.selectionMode = true;
      state.invitations.selectedIds = [];
      updatePendingSendPanel();
    });
    document.getElementById("cancel-selection-btn").addEventListener("click", () => {
      state.invitations.selectionMode = false;
      state.invitations.selectedIds = [];
      updatePendingSendPanel();
    });
    document.getElementById("send-selected-btn").addEventListener("click", async () => {
      if (!state.invitations.selectedIds.length) {
        setStatus("invite-status-line", "Erreur : aucune invitation sélectionnée.");
        return;
      }
      await sendInvitations(state.invitations.selectedIds);
      state.invitations.selectionMode = false;
      state.invitations.selectedIds = [];
    });
    document.getElementById("csv-file").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const text = await file.text();
      document.getElementById("csv-text").value = text;
      setStatus("invite-status-line", `Fichier chargé : ${file.name}`);
    });
    document.getElementById("cockpit-reload-btn").addEventListener("click", async () => {
      await loadCockpit();
      await loadBrevoHealth();
      if (state.technicalView === "visit-analytics") {
        await loadVisitAnalytics();
      }
    });
    document.getElementById("brevo-check-btn").addEventListener("click", loadBrevoHealth);
    document.getElementById("visit-analytics-check-btn").addEventListener("click", loadVisitAnalytics);
    document.getElementById("email-test-send-btn").addEventListener("click", sendSelectedEmailTest);
    updateSingleInvitationRoleUI();
    document.getElementById("task-reload-btn").addEventListener("click", loadTasks);
    document.getElementById("task-filter-status").addEventListener("change", loadTasks);
    document.getElementById("task-filter-search").addEventListener("input", renderTaskRows);
    document.getElementById("invite-reload-btn").addEventListener("click", loadInvitations);
    document.getElementById("invite-filter-status").addEventListener("change", loadInvitations);
    document.getElementById("invite-filter-search").addEventListener("input", renderInvitations);
    document.getElementById("invite-visible-search").addEventListener("input", (event) => {
      document.getElementById("invite-filter-search").value = event.currentTarget.value;
      renderInvitations();
    });
    document.getElementById("invite-visible-search-clear").addEventListener("click", () => {
      document.getElementById("invite-visible-search").value = "";
      document.getElementById("invite-filter-search").value = "";
      renderInvitations();
    });
    document.getElementById("invite-visible-reload-btn").addEventListener("click", loadInvitations);
    document.getElementById("candidate-response-reload-btn").addEventListener("click", () => loadQuestionnaireResponses("candidate", { clearUnseen: true }));
    document.getElementById("candidate-response-filter-search").addEventListener("input", () => renderQuestionnaireResponses("candidate"));
    document.getElementById("employer-response-reload-btn").addEventListener("click", () => loadQuestionnaireResponses("employer", { clearUnseen: true }));
    document.getElementById("employer-response-filter-search").addEventListener("input", () => renderQuestionnaireResponses("employer"));
    document.getElementById("global-watch-open-candidates").addEventListener("click", () => activateTab("candidate-responses"));
    document.getElementById("global-watch-open-employers").addEventListener("click", () => activateTab("employer-responses"));
    document.getElementById("data-history-reload-btn").addEventListener("click", async () => {
      if (state.dataHistoryView === "candidate-responses") await loadQuestionnaireResponses("candidate");
      if (state.dataHistoryView === "employer-responses") await loadQuestionnaireResponses("employer");
      if (state.dataHistoryView === "matchings") {
        document.getElementById("filter-status").value = "all";
        document.getElementById("filter-source").value = "all";
        await loadMatchings();
      }
      if (state.dataHistoryView === "invitations") {
        document.getElementById("invite-filter-status").value = "all";
        await loadInvitations();
      }
      if (state.dataHistoryView === "home") {
        await loadQuestionnaireResponses("candidate");
        await loadQuestionnaireResponses("employer");
        document.getElementById("filter-status").value = "all";
        document.getElementById("filter-source").value = "all";
        await loadMatchings();
        document.getElementById("invite-filter-status").value = "all";
        await loadInvitations();
      }
    });
    document.getElementById("data-history-search").addEventListener("input", (event) => {
      state.dataHistorySearch = event.currentTarget.value || "";
      renderDataHistoryView();
    });
    document.getElementById("data-history-search-clear").addEventListener("click", () => {
      state.dataHistorySearch = "";
      document.getElementById("data-history-search").value = "";
      renderDataHistoryView();
    });
    document.getElementById("relations-reload-btn").addEventListener("click", loadRelations);
    document.getElementById("relations-search").addEventListener("input", (event) => {
      state.relationsSearch = event.currentTarget.value || "";
      renderRelationRows();
    });
    document.getElementById("relations-search-clear").addEventListener("click", () => {
      state.relationsSearch = "";
      document.getElementById("relations-search").value = "";
      renderRelationRows();
    });
    for (const button of document.querySelectorAll("[data-open-relations]")) {
      button.addEventListener("click", async () => {
        activateTab("relations");
        setRelationsView(button.dataset.openRelations);
        await loadRelations();
      });
    }
    for (const button of document.querySelectorAll("[data-open-admin-data]")) {
      button.addEventListener("click", () => openAdminList(button.dataset.openAdminData));
    }
    for (const button of document.querySelectorAll("[data-open-history]")) {
      button.addEventListener("click", () => openDataHistoryView(button.dataset.openHistory));
    }
    document.getElementById("reload-btn").addEventListener("click", async () => {
      await loadBrevoHealth();
      await loadMatchings();
    });
    document.getElementById("manual-match-create-btn").addEventListener("click", () => createManualMatching(false));
    document.getElementById("manual-match-send-btn").addEventListener("click", () => createManualMatching(true));
    document.getElementById("matching-test-emails-btn").addEventListener("click", sendMatchingTestEmails);
    document.getElementById("spontaneous-send-btn").addEventListener("click", sendSpontaneousCandidate);
    document.getElementById("spontaneous-reload-btn").addEventListener("click", loadSpontaneousCandidates);
    document.getElementById("manual-match-candidate").addEventListener("change", renderManualMatchingPreview);
    document.getElementById("manual-match-employer").addEventListener("change", renderManualMatchingPreview);
    document.getElementById("filter-status").addEventListener("change", loadMatchings);
    document.getElementById("filter-source").addEventListener("change", renderMatchingRows);
    document.getElementById("filter-search").addEventListener("input", renderMatchingRows);
    document.getElementById("no-match-reload-btn").addEventListener("click", loadNoMatch);
    document.getElementById("no-match-filter-status").addEventListener("change", loadNoMatch);
    document.getElementById("no-match-filter-search").addEventListener("input", renderNoMatchRows);
    document.getElementById("new-job-reload-btn").addEventListener("click", loadNewJobs);
    document.getElementById("new-job-filter-status").addEventListener("change", loadNewJobs);
    document.getElementById("new-job-filter-search").addEventListener("input", renderNewJobRows);
    for (const button of document.querySelectorAll("[data-open-list]")) {
      button.addEventListener("click", () => openAdminList(button.dataset.openList));
    }
    for (const button of document.querySelectorAll("[data-tab]")) {
      button.addEventListener("click", () => {
        activateTab(button.dataset.tab);
        if (button.dataset.tab === "cockpit") {
          setTechnicalView("health");
        }
        if (button.dataset.tab === "invitations") {
          setInvitationView("dashboard");
          loadInvitations();
        }
        if (button.dataset.tab === "relations") {
          setRelationsView("to-launch");
          loadRelations();
        }
      });
    }
    activateTab("tasks");
    setTechnicalView("health");
    setInvitationView("dashboard");
    async function loadInitialAdminData() {
      // Keep hidden panels and external health checks off the critical path.
      await loadTasks();
      await loadCockpit();
      await loadQuestionnaireResponses("candidate");
      await loadQuestionnaireResponses("employer");
      startQuestionnaireAutoRefresh();
    }
    loadInitialAdminData();
