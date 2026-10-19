const FORM_ID = document.body.dataset.formId || "eures-beta";
    const state = {
      metadata: null,
      cards: [],
      lang: localStorage.getItem("eures-tracking-lang") || "fr",
      currentCard: null,
      draggingRecordId: null,
      suppressNextCardClick: false,
      isSavingCard: false,
      draftTimer: null,
      lastSavedDraftSnapshot: "",
    };

    const uiText = {
      fr: {
        pageTitle: "Suivi projet",
        lede: "Un kanban embarqué dans l’admin EURES pour suivre les sujets, les arbitrages, les blocages et les décisions sans sortir du projet.",
        quickLabel: "Créer une carte à partir d’un texte libre",
        quickFieldLabel: "Texte libre",
        quickHelp: "Décris le besoin en langage naturel et crée directement une carte prête à être classée dans le kanban.",
        quickSubhelp: "La carte est créée puis ouverte immédiatement pour compléter, classer ou corriger si besoin.",
        browserTitle: "EURES beta - Suivi projet",
        backAdmin: "Retour à l’admin EURES",
        logout: "Se déconnecter",
        quickPlaceholder: "Décrire un besoin, un bug, une idée ou une décision à préparer...",
        quickCreate: "Créer la carte",
        searchPlaceholder: "Rechercher un titre, un texte, un responsable",
        newCard: "Nouvelle carte",
        reload: "Rafraîchir",
        resetFilters: "Réinitialiser les filtres",
        filtersTitle: "Piloter le kanban",
        filtersHelp: "Recherche, filtre puis reviens rapidement à la vue par défaut sans perdre le contexte du tableau.",
        filterSearch: "Recherche",
        filterArchive: "Archive",
        filterType: "Type",
        filterPriority: "Priorité",
        filterSize: "Taille",
        drawerTitle: "Carte projet",
        close: "Fermer",
        save: "Enregistrer",
        archive: "Archiver la carte",
        restore: "Restaurer la carte",
        delete: "Supprimer",
        fieldTitle: "Sujet",
        fieldLanguage: "Langue source",
        fieldType: "Type",
        fieldStatus: "Statut",
        fieldPriority: "Priorité",
        fieldSize: "Taille de dev",
        fieldOwner: "Responsable",
        fieldSource: "Source",
        fieldDescription: "Problème ou besoin",
        fieldExpected: "Idée de solution",
        fieldObserved: "Situation actuelle",
        fieldContext: "Contexte utile",
        fieldIndicators: "Indicateurs associés",
        fieldTitlePlaceholder: "Ex. Empêcher la création en double d’une carte",
        fieldOwnerPlaceholder: "Ex. Eric, équipe produit, dev front",
        fieldSourcePlaceholder: "Ex. atelier PO, retour terrain, admin_ui",
        fieldDescriptionPlaceholder: "Décris simplement le besoin, le bug ou la demande métier.",
        fieldObservedPlaceholder: "Explique ce qui se passe aujourd’hui, avec un exemple concret si possible.",
        fieldExpectedPlaceholder: "Décris la solution envisagée ou le résultat attendu après correction.",
        fieldContextPlaceholder: "Ajoute ici les éléments utiles : contrainte, règle métier, écran concerné, audience, urgence...",
        fieldIndicatorsPlaceholder: "Qu’est-ce qu’on mesure après la mise en production ? Ex. taux de complétion, nombre de doublons, temps de saisie, usage de la fonctionnalité...",
        fieldLinks: "Liens",
        fieldLinksPlaceholder: "Un lien par ligne",
        fieldImages: "Images jointes",
        fieldImagesHelp: "Ajoute une capture d’écran ou une image utile à la carte. Les images sont compressées avant enregistrement.",
        imageEmpty: "Aucune image jointe.",
        imageRemove: "Retirer",
        imageOpen: "Ouvrir",
        imageProcessing: "Préparation de l’image...",
        imageCount: (count) => `${count} image(s) jointe(s).`,
        translateEn: "Traduire en EN",
        translateDe: "Traduire en DE",
        detailHeading: "Détail",
        commentsHeading: "Commentaires",
        commentPlaceholder: "Ajouter un commentaire interne...",
        commentAdd: "Ajouter",
        historyHeading: "Historique",
        boardLoaded: (count) => `${count} carte(s) chargée(s).`,
        noCards: "Aucune carte dans cette colonne.",
        commentsEmpty: "Aucun commentaire pour l’instant.",
        historyEmpty: "Aucun historique pour l’instant.",
        all: "Tous",
        activeOnly: "Actives",
        archivedOnly: "Archivées",
        untitled: "Sans titre",
        noOwner: "Responsable non défini",
        archivedBadge: "Archivée",
        detailId: "ID",
        detailReference: "Référence dev",
        detailDocumentation: "Documentation liée",
        detailStatus: "Statut",
        detailPriority: "Priorité",
        detailSize: "Taille",
        detailType: "Type",
        detailGithubBranch: "Branche GitHub",
        detailGithubPr: "Pull request GitHub",
        detailGithubState: "État GitHub",
        detailGithubLastActivity: "Dernière activité GitHub",
        detailDeploymentUrl: "URL de déploiement",
        detailDeploymentEnv: "Environnement déployé",
        detailDeploymentAt: "Déployé le",
        detailArchiveState: "Archivage",
        detailArchivedAt: "Archivée le",
        detailArchivedBy: "Archivée par",
        detailCreated: "Créée",
        detailUpdated: "Mise à jour",
        statusLoading: "Chargement du suivi projet...",
        statusSaved: "Carte enregistrée.",
        statusSaving: "Enregistrement en cours...",
        statusCommentNeedsSave: "Enregistre d’abord la carte avant d’ajouter un commentaire.",
        statusCommentAdded: "Commentaire ajouté.",
        statusArchiveNeedsSave: "Enregistre d’abord la carte avant de l’archiver.",
        statusArchiveConfirm: "Archiver cette carte et la sortir du flux actif ?",
        statusRestoreConfirm: "Restaurer cette carte dans le flux actif ?",
        statusArchived: "Carte archivée.",
        statusRestored: "Carte restaurée.",
        statusDeleteConfirm: "Supprimer définitivement cette carte ?",
        statusNeedFreeText: "Ajoute d’abord un texte libre.",
        statusCreating: "Création en cours...",
        statusCreated: "Carte créée.",
        statusDraftLocalSaved: "Saisie conservée automatiquement sur cet appareil.",
        statusDraftLocalRestored: "Dernière saisie non enregistrée restaurée.",
        statusDraftLocalCleared: "Saisie locale supprimée après enregistrement.",
        statusTranslating: "Traduction en cours...",
        statusTranslationApplied: "Traduction appliquée au formulaire courant.",
        statusLoadError: "Chargement impossible",
        statusRequestError: "Requête impossible",
        fallbackHistoryEvent: "Mise à jour",
        fallbackActor: "admin",
      },
      en: {
        pageTitle: "Project tracking",
        lede: "A native kanban inside the EURES admin to track topics, decisions, blockers and delivery work without leaving the project.",
        quickLabel: "Create a card from free text",
        quickFieldLabel: "Free text",
        quickHelp: "Describe the need in plain language and create a card directly, ready to be sorted in the kanban.",
        quickSubhelp: "The card is created and opened immediately so you can complete it, classify it or adjust it if needed.",
        browserTitle: "EURES beta - Project tracking",
        backAdmin: "Back to EURES admin",
        logout: "Log out",
        quickPlaceholder: "Describe a need, a bug, an idea or a decision to prepare...",
        quickCreate: "Create card",
        searchPlaceholder: "Search a title, a text or an owner",
        newCard: "New card",
        reload: "Refresh",
        resetFilters: "Reset filters",
        filtersTitle: "Control the kanban",
        filtersHelp: "Search, filter, then return quickly to the default view without losing the board context.",
        filterSearch: "Search",
        filterArchive: "Archive",
        filterType: "Type",
        filterPriority: "Priority",
        filterSize: "Size",
        drawerTitle: "Project card",
        close: "Close",
        save: "Save",
        archive: "Archive card",
        restore: "Restore card",
        delete: "Delete",
        fieldTitle: "Topic",
        fieldLanguage: "Source language",
        fieldType: "Type",
        fieldStatus: "Status",
        fieldPriority: "Priority",
        fieldSize: "Dev size",
        fieldOwner: "Owner",
        fieldSource: "Source",
        fieldDescription: "Problem or need",
        fieldExpected: "Solution idea",
        fieldObserved: "Current situation",
        fieldContext: "Useful context",
        fieldIndicators: "Success indicators",
        fieldTitlePlaceholder: "Ex. Prevent duplicate card creation",
        fieldOwnerPlaceholder: "Ex. Eric, product team, frontend dev",
        fieldSourcePlaceholder: "Ex. PO workshop, field feedback, admin_ui",
        fieldDescriptionPlaceholder: "Describe the need, bug or business request in simple terms.",
        fieldObservedPlaceholder: "Explain what happens today, ideally with a concrete example.",
        fieldExpectedPlaceholder: "Describe the proposed solution or the expected result after the fix.",
        fieldContextPlaceholder: "Add useful context here: constraint, business rule, impacted screen, audience, urgency...",
        fieldIndicatorsPlaceholder: "What should be measured after production release? Ex. completion rate, duplicate count, time to complete, feature usage...",
        fieldLinks: "Links",
        fieldLinksPlaceholder: "One link per line",
        fieldImages: "Attached images",
        fieldImagesHelp: "Add a screenshot or any useful image to the card. Images are compressed before saving.",
        imageEmpty: "No attached images.",
        imageRemove: "Remove",
        imageOpen: "Open",
        imageProcessing: "Preparing image...",
        imageCount: (count) => `${count} attached image(s).`,
        translateEn: "Translate to EN",
        translateDe: "Translate to DE",
        detailHeading: "Details",
        commentsHeading: "Comments",
        commentPlaceholder: "Add an internal comment...",
        commentAdd: "Add",
        historyHeading: "History",
        boardLoaded: (count) => `${count} card(s) loaded.`,
        noCards: "No cards in this column.",
        commentsEmpty: "No comments yet.",
        historyEmpty: "No history yet.",
        all: "All",
        activeOnly: "Active",
        archivedOnly: "Archived",
        untitled: "Untitled",
        noOwner: "No owner",
        archivedBadge: "Archived",
        detailId: "ID",
        detailReference: "Dev reference",
        detailDocumentation: "Linked documentation",
        detailStatus: "Status",
        detailPriority: "Priority",
        detailSize: "Size",
        detailType: "Type",
        detailGithubBranch: "GitHub branch",
        detailGithubPr: "GitHub pull request",
        detailGithubState: "GitHub state",
        detailGithubLastActivity: "Latest GitHub activity",
        detailDeploymentUrl: "Deployment URL",
        detailDeploymentEnv: "Deployed environment",
        detailDeploymentAt: "Deployed at",
        detailArchiveState: "Archive state",
        detailArchivedAt: "Archived at",
        detailArchivedBy: "Archived by",
        detailCreated: "Created",
        detailUpdated: "Updated",
        statusLoading: "Loading project tracking...",
        statusSaved: "Card saved.",
        statusSaving: "Saving...",
        statusCommentNeedsSave: "Save the card before adding a comment.",
        statusCommentAdded: "Comment added.",
        statusArchiveNeedsSave: "Save the card before archiving it.",
        statusArchiveConfirm: "Archive this card and remove it from the active flow?",
        statusRestoreConfirm: "Restore this card to the active flow?",
        statusArchived: "Card archived.",
        statusRestored: "Card restored.",
        statusDeleteConfirm: "Delete this card permanently?",
        statusNeedFreeText: "Add some free text first.",
        statusCreating: "Creating card...",
        statusCreated: "Card created.",
        statusDraftLocalSaved: "Your typing is being kept automatically on this device.",
        statusDraftLocalRestored: "Your last unsaved typing has been restored.",
        statusDraftLocalCleared: "Local typing cleared after save.",
        statusTranslating: "Translating...",
        statusTranslationApplied: "Translation applied to the current form.",
        statusLoadError: "Unable to load",
        statusRequestError: "Request failed",
        fallbackHistoryEvent: "Update",
        fallbackActor: "admin",
      },
      de: {
        pageTitle: "Projektverfolgung",
        lede: "Ein natives Kanban im EURES-Admin, um Themen, Entscheidungen, Blocker und Umsetzungen direkt im Projekt zu verfolgen.",
        quickLabel: "Karte aus Freitext erstellen",
        quickFieldLabel: "Freitext",
        quickHelp: "Beschreiben Sie den Bedarf in klarer Sprache und erstellen Sie direkt eine Karte, die im Kanban eingeordnet werden kann.",
        quickSubhelp: "Die Karte wird sofort erstellt und geoffnet, damit Sie sie bei Bedarf vervollstandigen, einordnen oder anpassen konnen.",
        browserTitle: "EURES beta - Projektverfolgung",
        backAdmin: "Zuruck zum EURES-Admin",
        logout: "Abmelden",
        quickPlaceholder: "Beschreiben Sie einen Bedarf, einen Fehler, eine Idee oder eine Entscheidung, die vorbereitet werden soll...",
        quickCreate: "Karte erstellen",
        searchPlaceholder: "Titel, Text oder verantwortliche Person suchen",
        newCard: "Neue Karte",
        reload: "Aktualisieren",
        resetFilters: "Filter zurucksetzen",
        filtersTitle: "Kanban steuern",
        filtersHelp: "Suchen, filtern und schnell zur Standardansicht zuruckkehren, ohne den Kontext des Boards zu verlieren.",
        filterSearch: "Suche",
        filterArchive: "Archiv",
        filterType: "Typ",
        filterPriority: "Prioritat",
        filterSize: "Umfang",
        drawerTitle: "Projektkarte",
        close: "Schliessen",
        save: "Speichern",
        archive: "Karte archivieren",
        restore: "Karte wiederherstellen",
        delete: "Loschen",
        fieldTitle: "Thema",
        fieldLanguage: "Ausgangssprache",
        fieldType: "Typ",
        fieldStatus: "Status",
        fieldPriority: "Prioritat",
        fieldSize: "Entwicklungsumfang",
        fieldOwner: "Verantwortlich",
        fieldSource: "Quelle",
        fieldDescription: "Problem oder Bedarf",
        fieldExpected: "Losungsidee",
        fieldObserved: "Aktuelle Situation",
        fieldContext: "Nutzlicher Kontext",
        fieldIndicators: "Erfolgsindikatoren",
        fieldTitlePlaceholder: "Z. B. Doppelte Kartenerstellung verhindern",
        fieldOwnerPlaceholder: "Z. B. Eric, Produktteam, Frontend-Entwicklung",
        fieldSourcePlaceholder: "Z. B. PO-Workshop, Feldruckmeldung, admin_ui",
        fieldDescriptionPlaceholder: "Beschreiben Sie den Bedarf, den Fehler oder die fachliche Anfrage in einfachen Worten.",
        fieldObservedPlaceholder: "Erklaren Sie, was heute passiert, moglichst mit einem konkreten Beispiel.",
        fieldExpectedPlaceholder: "Beschreiben Sie die angedachte Losung oder das erwartete Ergebnis nach der Korrektur.",
        fieldContextPlaceholder: "Fugen Sie hier nutzlichen Kontext hinzu: Einschrankung, Fachregel, betroffener Bildschirm, Zielgruppe, Dringlichkeit...",
        fieldIndicatorsPlaceholder: "Was soll nach dem Produktivgang gemessen werden? Z. B. Abschlussquote, Anzahl von Duplikaten, Eingabezeit, Nutzung der Funktion...",
        fieldLinks: "Links",
        fieldLinksPlaceholder: "Ein Link pro Zeile",
        fieldImages: "Bilder",
        fieldImagesHelp: "Fugen Sie einen Screenshot oder ein anderes nutzliches Bild zur Karte hinzu. Die Bilder werden vor dem Speichern komprimiert.",
        imageEmpty: "Keine Bilder angehangt.",
        imageRemove: "Entfernen",
        imageOpen: "Offnen",
        imageProcessing: "Bild wird vorbereitet...",
        imageCount: (count) => `${count} Bild(er) angehangt.`,
        translateEn: "Nach EN ubersetzen",
        translateDe: "Nach DE ubersetzen",
        detailHeading: "Details",
        commentsHeading: "Kommentare",
        commentPlaceholder: "Internen Kommentar hinzufugen...",
        commentAdd: "Hinzufugen",
        historyHeading: "Verlauf",
        boardLoaded: (count) => `${count} Karte(n) geladen.`,
        noCards: "Keine Karten in dieser Spalte.",
        commentsEmpty: "Noch keine Kommentare.",
        historyEmpty: "Noch kein Verlauf.",
        all: "Alle",
        activeOnly: "Aktive",
        archivedOnly: "Archivierte",
        untitled: "Ohne Titel",
        noOwner: "Keine verantwortliche Person",
        archivedBadge: "Archiviert",
        detailId: "ID",
        detailReference: "Dev-Referenz",
        detailDocumentation: "Verknupfte Dokumentation",
        detailStatus: "Status",
        detailPriority: "Prioritat",
        detailSize: "Umfang",
        detailType: "Typ",
        detailGithubBranch: "GitHub-Branch",
        detailGithubPr: "GitHub-Pull-Request",
        detailGithubState: "GitHub-Status",
        detailGithubLastActivity: "Letzte GitHub-Aktivitat",
        detailDeploymentUrl: "Deployment-URL",
        detailDeploymentEnv: "Deployte Umgebung",
        detailDeploymentAt: "Deployt am",
        detailArchiveState: "Archivstatus",
        detailArchivedAt: "Archiviert am",
        detailArchivedBy: "Archiviert von",
        detailCreated: "Erstellt",
        detailUpdated: "Aktualisiert",
        statusLoading: "Projektverfolgung wird geladen...",
        statusSaved: "Karte gespeichert.",
        statusSaving: "Speichern lauft...",
        statusCommentNeedsSave: "Speichern Sie die Karte zuerst, bevor Sie einen Kommentar hinzufugen.",
        statusCommentAdded: "Kommentar hinzugefugt.",
        statusArchiveNeedsSave: "Speichern Sie die Karte zuerst, bevor Sie sie archivieren.",
        statusArchiveConfirm: "Diese Karte archivieren und aus dem aktiven Ablauf nehmen?",
        statusRestoreConfirm: "Diese Karte wieder in den aktiven Ablauf aufnehmen?",
        statusArchived: "Karte archiviert.",
        statusRestored: "Karte wiederhergestellt.",
        statusDeleteConfirm: "Diese Karte endgultig loschen?",
        statusNeedFreeText: "Fugen Sie zuerst einen Freitext hinzu.",
        statusCreating: "Karte wird erstellt...",
        statusCreated: "Karte erstellt.",
        statusDraftLocalSaved: "Ihre Eingabe wird auf diesem Gerat automatisch gesichert.",
        statusDraftLocalRestored: "Die letzte nicht gespeicherte Eingabe wurde wiederhergestellt.",
        statusDraftLocalCleared: "Die lokale Eingabe wurde nach dem Speichern entfernt.",
        statusTranslating: "Ubersetzung lauft...",
        statusTranslationApplied: "Ubersetzung auf das aktuelle Formular angewendet.",
        statusLoadError: "Laden nicht moglich",
        statusRequestError: "Anfrage fehlgeschlagen",
        fallbackHistoryEvent: "Aktualisierung",
        fallbackActor: "admin",
      }
    };

    const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    }[char]));

    function apiUrl(path) {
      return `/api/forms/${FORM_ID}${path}`;
    }

    function t(key) {
      const copy = uiText[state.lang] || uiText.fr;
      return copy[key] ?? uiText.fr[key] ?? key;
    }

    function currentLabels() {
      return state.metadata?.labels?.[state.lang] || state.metadata?.labels?.fr || {};
    }

    function setStatus(id, text) {
      document.getElementById(id).textContent = text || "";
    }

    function setCardSavingState(isSaving) {
      state.isSavingCard = Boolean(isSaving);
      for (const saveButton of document.querySelectorAll("#save-card-btn, #save-card-btn-bottom")) {
        saveButton.disabled = state.isSavingCard;
        saveButton.setAttribute("aria-disabled", state.isSavingCard ? "true" : "false");
      }
    }

    function autoResizeTextarea(textarea) {
      if (!textarea) return;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textarea.scrollHeight, 56)}px`;
    }

    function bindAutoResize(scope = document) {
      for (const textarea of scope.querySelectorAll("textarea")) {
        autoResizeTextarea(textarea);
        if (!textarea.dataset.autoResizeBound) {
          textarea.addEventListener("input", () => autoResizeTextarea(textarea));
          textarea.dataset.autoResizeBound = "true";
        }
      }
    }

    function normalizeText(value) {
      return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function formatBytes(value) {
      const size = Number(value || 0);
      if (!size) return "";
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function defaultCard() {
      return {
        titre: "",
        langue_source: "fr",
        type: "evolution",
        description: "",
        attendu: "",
        observe: "",
        contexte: "",
        indicateurs_suivi: "",
        statut: "a_qualifier",
        priorite: "moyenne",
        taille_dev: "chat",
        responsable: "",
        source: "admin_ui",
        archived: false,
        archived_at: "",
        archived_by: "",
        images: [],
        liens: [],
        commentaires: [],
        historique: []
      };
    }

    function currentDraftStorageKey(card = state.currentCard) {
      if (!card) return null;
      return card.record_id ? `eures-tracking-draft-record-${card.record_id}` : `eures-tracking-draft-card-${card.card_id || "new"}`;
    }

    function draftSnapshot(card) {
      if (!card) return "";
      return JSON.stringify({
        card_id: card.card_id || "",
        record_id: card.record_id || "",
        titre: card.titre || "",
        langue_source: card.langue_source || "fr",
        type: card.type || "evolution",
        description: card.description || "",
        attendu: card.attendu || "",
        observe: card.observe || "",
        contexte: card.contexte || "",
        indicateurs_suivi: card.indicateurs_suivi || "",
        statut: card.statut || "a_qualifier",
        priorite: card.priorite || "moyenne",
        taille_dev: card.taille_dev || "chat",
        responsable: card.responsable || "",
        source: card.source || "admin_ui",
        archived: Boolean(card.archived),
        liens: Array.isArray(card.liens) ? card.liens : [],
        images: Array.isArray(card.images) ? card.images : [],
      });
    }

    function saveDraftLocally(showStatus = false) {
      if (!state.currentCard) return;
      const draft = readFormCard();
      state.currentCard = { ...state.currentCard, ...draft };
      const key = currentDraftStorageKey(state.currentCard);
      if (!key) return;
      const snapshot = draftSnapshot(state.currentCard);
      if (snapshot === state.lastSavedDraftSnapshot) return;
      localStorage.setItem(key, snapshot);
      state.lastSavedDraftSnapshot = snapshot;
      if (showStatus) setStatus("draft-status", t("statusDraftLocalSaved"));
    }

    function clearLocalDraft(card = state.currentCard, showStatus = false) {
      const key = currentDraftStorageKey(card);
      if (key) localStorage.removeItem(key);
      state.lastSavedDraftSnapshot = "";
      if (showStatus) setStatus("draft-status", t("statusDraftLocalCleared"));
      else setStatus("draft-status", "");
    }

    function restoreLocalDraftIfAny(card) {
      const key = currentDraftStorageKey(card);
      if (!key) return card;
      const raw = localStorage.getItem(key);
      if (!raw) {
        state.lastSavedDraftSnapshot = draftSnapshot(card);
        setStatus("draft-status", "");
        return card;
      }
      try {
        const parsed = JSON.parse(raw);
        const restored = { ...card, ...parsed };
        state.lastSavedDraftSnapshot = draftSnapshot(restored);
        setStatus("draft-status", t("statusDraftLocalRestored"));
        return restored;
      } catch (error) {
        localStorage.removeItem(key);
        state.lastSavedDraftSnapshot = draftSnapshot(card);
        setStatus("draft-status", "");
        return card;
      }
    }

    function scheduleDraftAutosave() {
      if (state.draftTimer) window.clearTimeout(state.draftTimer);
      state.draftTimer = window.setTimeout(() => {
        saveDraftLocally(true);
        scheduleDraftAutosave();
      }, 10000);
    }

    function bindDraftAutosave() {
      const form = document.getElementById("card-form");
      if (form.dataset.draftAutosaveBound) return;
      form.addEventListener("input", () => {
        saveDraftLocally(false);
        scheduleDraftAutosave();
      });
      form.addEventListener("change", () => {
        saveDraftLocally(true);
        scheduleDraftAutosave();
      });
      form.dataset.draftAutosaveBound = "true";
    }

    async function fetchJson(url, options = {}) {
      const mergedHeaders = { "X-UI-Language": state.lang, ...(options.headers || {}) };
      const response = await fetch(url, { credentials: "same-origin", ...options, headers: mergedHeaders });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || t("statusRequestError"));
      }
      return payload;
    }

    function populateSelect(selectId, values, labelMap, includeAll = false) {
      const select = document.getElementById(selectId);
      const options = [];
      if (includeAll) options.push(`<option value="">${esc(t("all"))}</option>`);
      for (const value of values) {
        options.push(`<option value="${esc(value)}">${esc(labelMap?.[value] || value)}</option>`);
      }
      select.innerHTML = options.join("");
    }

    function renderLanguageSwitch() {
      const wrapper = document.getElementById("lang-switch");
      wrapper.innerHTML = ["fr", "en", "de"].map((lang) => `
        <button type="button" class="${lang === state.lang ? "is-active" : ""}" data-lang="${lang}">${lang.toUpperCase()}</button>
      `).join("");
      wrapper.querySelectorAll("[data-lang]").forEach((button) => {
        button.addEventListener("click", () => {
          state.lang = button.dataset.lang;
          localStorage.setItem("eures-tracking-lang", state.lang);
          renderStaticText();
          renderBoard();
          renderDrawer();
          renderFilters();
          renderLanguageSwitch();
        });
      });
    }

    function renderStaticText() {
      document.documentElement.lang = state.lang;
      document.title = t("browserTitle");
      document.getElementById("page-title").textContent = t("pageTitle");
      document.getElementById("page-lede").textContent = t("lede");
      document.getElementById("back-admin-link").textContent = t("backAdmin");
      document.getElementById("logout-link").textContent = t("logout");
      document.getElementById("quick-note-title").textContent = t("quickLabel");
      document.getElementById("quick-note-help").textContent = t("quickHelp");
      document.getElementById("quick-note-label").textContent = t("quickFieldLabel");
      document.getElementById("quick-note").placeholder = t("quickPlaceholder");
      document.getElementById("quick-note-subhelp").textContent = t("quickSubhelp");
      document.getElementById("quick-create-btn").textContent = t("quickCreate");
      document.getElementById("filters-title").textContent = t("filtersTitle");
      document.getElementById("filters-help").textContent = t("filtersHelp");
      document.getElementById("filter-search-label").textContent = t("filterSearch");
      document.getElementById("filter-archive-label").textContent = t("filterArchive");
      document.getElementById("filter-type-label").textContent = t("filterType");
      document.getElementById("filter-priority-label").textContent = t("filterPriority");
      document.getElementById("filter-size-label").textContent = t("filterSize");
      document.getElementById("filter-search").placeholder = t("searchPlaceholder");
      document.getElementById("new-card-btn").textContent = t("newCard");
      document.getElementById("reset-filters-btn").textContent = t("resetFilters");
      document.getElementById("reload-btn").textContent = t("reload");
      document.getElementById("close-drawer-btn").textContent = t("close");
      document.getElementById("save-card-btn").textContent = t("save");
      document.getElementById("save-card-btn-bottom").textContent = t("save");
      document.getElementById("archive-card-btn").textContent = state.currentCard?.archived ? t("restore") : t("archive");
      document.getElementById("delete-card-btn").textContent = t("delete");
      document.getElementById("label-card-titre").childNodes[0].textContent = t("fieldTitle");
      document.getElementById("label-card-langue").childNodes[0].textContent = t("fieldLanguage");
      document.getElementById("label-card-type").childNodes[0].textContent = t("fieldType");
      document.getElementById("label-card-statut").childNodes[0].textContent = t("fieldStatus");
      document.getElementById("label-card-priorite").childNodes[0].textContent = t("fieldPriority");
      document.getElementById("label-card-taille").childNodes[0].textContent = t("fieldSize");
      document.getElementById("label-card-responsable").childNodes[0].textContent = t("fieldOwner");
      document.getElementById("label-card-source").childNodes[0].textContent = t("fieldSource");
      document.getElementById("label-card-description").childNodes[0].textContent = t("fieldDescription");
      document.getElementById("label-card-attendu").childNodes[0].textContent = t("fieldExpected");
      document.getElementById("label-card-observe").childNodes[0].textContent = t("fieldObserved");
      document.getElementById("label-card-contexte").childNodes[0].textContent = t("fieldContext");
      document.getElementById("label-card-indicateurs").childNodes[0].textContent = t("fieldIndicators");
      document.getElementById("card-titre").placeholder = t("fieldTitlePlaceholder");
      document.getElementById("card-responsable").placeholder = t("fieldOwnerPlaceholder");
      document.getElementById("card-source").placeholder = t("fieldSourcePlaceholder");
      document.getElementById("card-description").placeholder = t("fieldDescriptionPlaceholder");
      document.getElementById("card-observe").placeholder = t("fieldObservedPlaceholder");
      document.getElementById("card-attendu").placeholder = t("fieldExpectedPlaceholder");
      document.getElementById("card-contexte").placeholder = t("fieldContextPlaceholder");
      document.getElementById("card-indicateurs").placeholder = t("fieldIndicatorsPlaceholder");
      document.getElementById("label-card-liens").childNodes[0].textContent = t("fieldLinks");
      document.getElementById("card-liens").placeholder = t("fieldLinksPlaceholder");
      document.getElementById("label-card-images").childNodes[0].textContent = t("fieldImages");
      document.getElementById("card-images-help").textContent = t("fieldImagesHelp");
      document.getElementById("translate-en-btn").textContent = t("translateEn");
      document.getElementById("translate-de-btn").textContent = t("translateDe");
      document.getElementById("detail-heading").textContent = t("detailHeading");
      document.getElementById("comments-heading").textContent = t("commentsHeading");
      document.getElementById("comment-body").placeholder = t("commentPlaceholder");
      document.getElementById("comment-save-btn").textContent = t("commentAdd");
      document.getElementById("history-heading").textContent = t("historyHeading");
      if (!document.getElementById("draft-status").textContent) {
        setStatus("draft-status", "");
      }
    }

    function renderFilters() {
      const labels = currentLabels();
      const currentArchive = document.getElementById("filter-archive").value || "active";
      const currentType = document.getElementById("filter-type").value;
      const currentPriority = document.getElementById("filter-priority").value;
      const currentSize = document.getElementById("filter-size").value;
      const archive = document.getElementById("filter-archive");
      archive.innerHTML = `
        <option value="active">${esc(t("activeOnly"))}</option>
        <option value="archived">${esc(t("archivedOnly"))}</option>
        <option value="all">${esc(t("all"))}</option>
      `;
      populateSelect("filter-type", state.metadata.types, labels.types, true);
      populateSelect("filter-priority", state.metadata.priorities, labels.priorities, true);
      populateSelect("filter-size", state.metadata.sizes, labels.sizes, true);
      archive.value = currentArchive;
      document.getElementById("filter-type").value = currentType;
      document.getElementById("filter-priority").value = currentPriority;
      document.getElementById("filter-size").value = currentSize;

      populateSelect("card-langue", state.metadata.languages, { fr: "FR", en: "EN", de: "DE" });
      populateSelect("card-type", state.metadata.types, labels.types);
      populateSelect("card-statut", state.metadata.statuses, labels.statuses);
      populateSelect("card-priorite", state.metadata.priorities, labels.priorities);
      populateSelect("card-taille", state.metadata.sizes, labels.sizes);
    }

    function filteredCards() {
      const search = normalizeText(document.getElementById("filter-search").value.trim());
      const archive = document.getElementById("filter-archive").value || "active";
      const type = document.getElementById("filter-type").value;
      const priority = document.getElementById("filter-priority").value;
      const size = document.getElementById("filter-size").value;

      return state.cards.filter((card) => {
        if (archive === "active" && card.archived) return false;
        if (archive === "archived" && !card.archived) return false;
        if (type && card.type !== type) return false;
        if (priority && card.priorite !== priority) return false;
        if (size && card.taille_dev !== size) return false;
        if (!search) return true;
        const haystack = normalizeText([
          card.titre,
          card.description,
          card.observe,
          card.attendu,
          card.contexte,
          card.responsable
        ].join(" "));
        return haystack.includes(search);
      });
    }

    function renderBoard() {
      const board = document.getElementById("board");
      const labels = currentLabels();
      const cards = filteredCards();
      board.innerHTML = state.metadata.statuses.map((status) => {
        const inColumn = cards.filter((card) => card.statut === status);
        return `
          <section class="board-column" data-status="${esc(status)}">
            <div class="board-column-head">
              <h2 class="board-column-title">${esc(labels.statuses?.[status] || status)}</h2>
              <span class="board-column-count">${inColumn.length}</span>
            </div>
            <div class="board-cards">
              ${inColumn.length ? inColumn.map(renderCardHtml).join("") : `<div class="empty-state">${esc((uiText[state.lang] || uiText.fr).noCards)}</div>`}
            </div>
          </section>
        `;
      }).join("");

      for (const cardEl of board.querySelectorAll(".card-item")) {
        cardEl.addEventListener("click", () => {
          if (state.suppressNextCardClick) {
            state.suppressNextCardClick = false;
            return;
          }
          openCard(Number(cardEl.dataset.recordId));
        });
        cardEl.addEventListener("dragstart", (event) => {
          if (cardEl.getAttribute("draggable") !== "true") {
            event.preventDefault();
            return;
          }
          state.suppressNextCardClick = false;
          state.draggingRecordId = Number(cardEl.dataset.recordId);
          cardEl.classList.add("is-dragging");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(state.draggingRecordId));
        });
        cardEl.addEventListener("dragend", () => {
          if (state.draggingRecordId) {
            state.suppressNextCardClick = true;
            window.setTimeout(() => {
              state.suppressNextCardClick = false;
            }, 180);
          }
          state.draggingRecordId = null;
          cardEl.classList.remove("is-dragging");
          board.querySelectorAll(".board-column").forEach((col) => col.classList.remove("is-drop-target"));
        });
      }

      for (const column of board.querySelectorAll(".board-column")) {
        column.addEventListener("dragover", (event) => {
          event.preventDefault();
          column.classList.add("is-drop-target");
        });
        column.addEventListener("dragleave", () => column.classList.remove("is-drop-target"));
        column.addEventListener("drop", async (event) => {
          event.preventDefault();
          column.classList.remove("is-drop-target");
          const recordId = Number(event.dataTransfer.getData("text/plain") || state.draggingRecordId || 0);
          if (!recordId) return;
          const card = state.cards.find((item) => Number(item.record_id) === recordId);
          if (!card) return;
          if (card.archived) return;
          const nextStatus = column.dataset.status;
          if (card.statut === nextStatus) return;
          await saveCard({ ...card, statut: nextStatus }, recordId, true, false);
        });
      }
    }

    function renderCardHtml(card) {
      const labels = currentLabels();
      const activityDate = (card.github_last_activity_at || card.updated_at || "").replace("T", " ").slice(0, 16);
      const activityPrefix = card.github_last_activity_at ? "GH" : "MAJ";
      return `
        <article class="card-item" data-record-id="${Number(card.record_id)}" draggable="${card.archived ? "false" : "true"}">
          <h3>${esc(card.titre || t("untitled"))}</h3>
          <div class="card-tags">
            <span class="pill">${esc(labels.priorities?.[card.priorite] || card.priorite)}</span>
            <span class="pill">${esc(labels.sizes?.[card.taille_dev] || card.taille_dev)}</span>
            <span class="pill">${esc(labels.types?.[card.type] || card.type)}</span>
            ${Array.isArray(card.images) && card.images.length ? `<span class="pill">Img ${card.images.length}</span>` : ""}
            ${card.archived ? `<span class="pill archived">${esc(t("archivedBadge"))}</span>` : ""}
          </div>
          <div class="card-meta">${esc(card.reference || card.card_id || "")} · ${esc(card.responsable || t("noOwner"))} · ${esc(activityPrefix)} ${esc(activityDate)}</div>
        </article>
      `;
    }

    function renderDrawer() {
      const shell = document.getElementById("drawer-shell");
      if (!state.currentCard) {
        shell.classList.remove("is-open");
        shell.setAttribute("aria-hidden", "true");
        return;
      }
      shell.classList.add("is-open");
      shell.setAttribute("aria-hidden", "false");
      const card = state.currentCard;
      const labels = currentLabels();
      document.getElementById("drawer-title").textContent = card.titre || t("drawerTitle");
      document.getElementById("card-titre").value = card.titre || "";
      document.getElementById("card-langue").value = card.langue_source || "fr";
      document.getElementById("card-type").value = card.type || "evolution";
      document.getElementById("card-statut").value = card.statut || "a_qualifier";
      document.getElementById("card-priorite").value = card.priorite || "moyenne";
      document.getElementById("card-taille").value = card.taille_dev || "chat";
      document.getElementById("card-responsable").value = card.responsable || "";
      document.getElementById("card-source").value = card.source || "";
      document.getElementById("card-description").value = card.description || "";
      document.getElementById("card-attendu").value = card.attendu || "";
      document.getElementById("card-observe").value = card.observe || "";
      document.getElementById("card-contexte").value = card.contexte || "";
      document.getElementById("card-indicateurs").value = card.indicateurs_suivi || "";
      document.getElementById("card-liens").value = (card.liens || []).join("\n");
      document.getElementById("archive-card-btn").textContent = card.archived ? t("restore") : t("archive");
      document.getElementById("card-images-input").value = "";
      renderImageGallery();
      bindAutoResize(document.getElementById("card-form"));
      autoResizeTextarea(document.getElementById("comment-body"));

      document.getElementById("detail-list").innerHTML = `
        <div class="detail-row"><dt>${esc(t("detailId"))}</dt><dd>${esc(card.card_id || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailReference"))}</dt><dd>${esc(card.reference || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailDocumentation"))}</dt><dd>${card.reference ? `<a href="/admin/eures-beta/documentation?card=${encodeURIComponent(card.reference)}">${esc(card.reference)}</a>` : ""}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailStatus"))}</dt><dd>${esc(labels.statuses?.[card.statut] || card.statut)}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailPriority"))}</dt><dd>${esc(labels.priorities?.[card.priorite] || card.priorite)}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailSize"))}</dt><dd>${esc(labels.sizes?.[card.taille_dev] || card.taille_dev)}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailType"))}</dt><dd>${esc(labels.types?.[card.type] || card.type)}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailGithubBranch"))}</dt><dd>${esc(card.github_branch || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailGithubPr"))}</dt><dd>${card.github_pr_url ? `<a href="${esc(card.github_pr_url)}" target="_blank" rel="noreferrer">${esc(card.github_pr_number ? `#${card.github_pr_number}` : card.github_pr_url)}</a>` : ""}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailGithubState"))}</dt><dd>${esc(card.github_pr_state || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailGithubLastActivity"))}</dt><dd>${esc(card.github_last_activity_at || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailDeploymentUrl"))}</dt><dd>${card.production_url ? `<a href="${esc(card.production_url)}" target="_blank" rel="noreferrer">${esc(card.production_url)}</a>` : ""}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailDeploymentEnv"))}</dt><dd>${esc(card.production_environment || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailDeploymentAt"))}</dt><dd>${esc(card.production_deployed_at || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailArchiveState"))}</dt><dd>${esc(card.archived ? t("archivedBadge") : t("activeOnly"))}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailArchivedAt"))}</dt><dd>${esc(card.archived_at || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailArchivedBy"))}</dt><dd>${esc(card.archived_by || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailCreated"))}</dt><dd>${esc(card.created_at || "")}</dd></div>
        <div class="detail-row"><dt>${esc(t("detailUpdated"))}</dt><dd>${esc(card.updated_at || "")}</dd></div>
      `;
      renderComments();
      renderHistory();
    }

    function renderImageGallery() {
      const gallery = document.getElementById("card-images-gallery");
      const images = Array.isArray(state.currentCard?.images) ? state.currentCard.images : [];
      if (!images.length) {
        gallery.innerHTML = `<div class="empty-state">${esc(t("imageEmpty"))}</div>`;
        return;
      }
      gallery.innerHTML = images.map((image) => `
        <article class="image-card">
          <img src="${esc(image.data_url || "")}" alt="${esc(image.name || "image")}">
          <div class="image-card-meta">
            <strong>${esc(image.name || "image")}</strong>
            <span>${esc([formatBytes(image.size), image.width && image.height ? `${image.width}×${image.height}` : ""].filter(Boolean).join(" · "))}</span>
          </div>
          <div class="image-card-actions">
            <a href="${esc(image.data_url || "")}" target="_blank" rel="noreferrer">${esc(t("imageOpen"))}</a>
            <button type="button" data-remove-image-id="${esc(image.id || "")}">${esc(t("imageRemove"))}</button>
          </div>
        </article>
      `).join("");
      gallery.querySelectorAll("[data-remove-image-id]").forEach((button) => {
        button.addEventListener("click", () => removeCurrentImage(button.dataset.removeImageId));
      });
    }

    function removeCurrentImage(imageId) {
      if (!state.currentCard) return;
      state.currentCard.images = (state.currentCard.images || []).filter((image) => image.id !== imageId);
      renderImageGallery();
      saveDraftLocally(true);
      scheduleDraftAutosave();
      setStatus("drawer-status", t("imageCount")(state.currentCard.images.length));
    }

    async function fileToDataUrl(file) {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read_failed"));
        reader.readAsDataURL(file);
      });
    }

    async function imageFileToAttachment(file) {
      const rawDataUrl = await fileToDataUrl(file);
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image_load_failed"));
        image.src = rawDataUrl;
      });
      const maxDimension = 1600;
      const ratio = Math.min(1, maxDimension / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const width = Math.max(1, Math.round((img.naturalWidth || 1) * ratio));
      const height = Math.max(1, Math.round((img.naturalHeight || 1) * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      let mime = file.type && file.type.startsWith("image/") ? file.type : "image/png";
      let dataUrl = canvas.toDataURL(mime);
      if (dataUrl.length > 1_800_000) {
        mime = "image/jpeg";
        dataUrl = canvas.toDataURL("image/jpeg", 0.86);
      }
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : `img_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: file.name || "image",
        mime,
        size: file.size || 0,
        width,
        height,
        created_at: new Date().toISOString(),
        data_url: dataUrl,
      };
    }

    async function handleImageSelection(fileList) {
      if (!state.currentCard) {
        state.currentCard = restoreLocalDraftIfAny(defaultCard());
      }
      const files = Array.from(fileList || []).filter((file) => String(file.type || "").startsWith("image/"));
      if (!files.length) return;
      setStatus("drawer-status", t("imageProcessing"));
      const nextImages = Array.isArray(state.currentCard.images) ? [...state.currentCard.images] : [];
      for (const file of files) {
        if (nextImages.length >= 4) break;
        const image = await imageFileToAttachment(file);
        nextImages.push(image);
      }
      state.currentCard.images = nextImages.slice(0, 4);
      renderImageGallery();
      saveDraftLocally(true);
      scheduleDraftAutosave();
      setStatus("drawer-status", t("imageCount")(state.currentCard.images.length));
      document.getElementById("card-images-input").value = "";
    }

    function renderComments() {
      const list = document.getElementById("comment-list");
      const card = state.currentCard;
      const comments = Array.isArray(card?.commentaires) ? card.commentaires : [];
      if (!comments.length) {
        list.innerHTML = `<div class="empty-state">${esc((uiText[state.lang] || uiText.fr).commentsEmpty)}</div>`;
        return;
      }
      list.innerHTML = comments.slice().reverse().map((comment) => `
        <article class="comment-item">
          <div class="comment-meta"><strong>${esc(comment.author || t("fallbackActor"))}</strong> · ${esc(comment.created_at || "")}</div>
          <p>${esc(comment.body || "")}</p>
        </article>
      `).join("");
    }

    function renderHistory() {
      const list = document.getElementById("history-list");
      const card = state.currentCard;
      const history = Array.isArray(card?.historique) ? card.historique : [];
      if (!history.length) {
        list.innerHTML = `<div class="empty-state">${esc((uiText[state.lang] || uiText.fr).historyEmpty)}</div>`;
        return;
      }
      list.innerHTML = history.slice().reverse().map((event) => `
        <article class="history-item">
          <strong>${esc(event.message || event.action || t("fallbackHistoryEvent"))}</strong>
          <p>${esc(event.actor || t("fallbackActor"))} · ${esc(event.at || "")}</p>
        </article>
      `).join("");
    }

    function openCard(recordId) {
      const card = state.cards.find((item) => Number(item.record_id) === Number(recordId));
      state.currentCard = restoreLocalDraftIfAny(card ? structuredClone(card) : defaultCard());
      setStatus("drawer-status", "");
      setStatus("translation-status", "");
      renderDrawer();
      scheduleDraftAutosave();
    }

    function closeDrawer() {
      if (state.draftTimer) {
        window.clearTimeout(state.draftTimer);
        state.draftTimer = null;
      }
      state.currentCard = null;
      document.getElementById("comment-body").value = "";
      document.getElementById("card-images-input").value = "";
      setStatus("draft-status", "");
      renderDrawer();
    }

    function resetFilters() {
      document.getElementById("filter-search").value = "";
      document.getElementById("filter-archive").value = "active";
      document.getElementById("filter-type").value = "";
      document.getElementById("filter-priority").value = "";
      document.getElementById("filter-size").value = "";
      renderBoard();
    }

    function readFormCard() {
      const base = state.currentCard || defaultCard();
      return {
        ...base,
        titre: document.getElementById("card-titre").value.trim(),
        langue_source: document.getElementById("card-langue").value,
        type: document.getElementById("card-type").value,
        statut: document.getElementById("card-statut").value,
        priorite: document.getElementById("card-priorite").value,
        taille_dev: document.getElementById("card-taille").value,
        responsable: document.getElementById("card-responsable").value.trim(),
        source: document.getElementById("card-source").value.trim() || "admin_ui",
        description: document.getElementById("card-description").value.trim(),
        attendu: document.getElementById("card-attendu").value.trim(),
        observe: document.getElementById("card-observe").value.trim(),
        contexte: document.getElementById("card-contexte").value.trim(),
        indicateurs_suivi: document.getElementById("card-indicateurs").value.trim(),
        images: Array.isArray(base.images) ? base.images : [],
        liens: document.getElementById("card-liens").value.split("\n").map((item) => item.trim()).filter(Boolean),
        archived: Boolean(base.archived)
      };
    }

    async function loadBoard() {
      setStatus("board-status", t("statusLoading"));
      const payload = await fetchJson(apiUrl("/admin/tracking/cards"));
      state.metadata = payload.metadata;
      state.cards = Array.isArray(payload.cards) ? payload.cards : [];
      renderLanguageSwitch();
      renderStaticText();
      renderFilters();
      renderBoard();
      bindDraftAutosave();
      bindAutoResize();
      setStatus("board-status", (uiText[state.lang] || uiText.fr).boardLoaded(state.cards.length));
      if (state.currentCard?.record_id) {
        const fresh = state.cards.find((card) => Number(card.record_id) === Number(state.currentCard.record_id));
        if (fresh) {
          state.currentCard = restoreLocalDraftIfAny(structuredClone(fresh));
          renderDrawer();
        }
      }
    }

    async function saveCard(cardPayload, recordId = null, silent = false, reopenAfterSave = true) {
      if (state.isSavingCard) return;
      const draftCardBeforeSave = state.currentCard ? { ...state.currentCard, ...cardPayload } : cardPayload;
      const previousDraftKey = currentDraftStorageKey(draftCardBeforeSave);
      const url = recordId ? apiUrl(`/admin/tracking/cards/${recordId}`) : apiUrl("/admin/tracking/cards");
      const method = recordId ? "PATCH" : "POST";
      setCardSavingState(true);
      if (!silent) {
        setStatus("drawer-status", t("statusSaving"));
      }
      try {
        const payload = await fetchJson(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cardPayload)
        });
        if (previousDraftKey) localStorage.removeItem(previousDraftKey);
        if (!silent) {
          setStatus("drawer-status", payload.warnings?.length ? payload.warnings.join(" ") : t("statusSaved"));
        }
        await loadBoard();
        clearLocalDraft(payload.card || draftCardBeforeSave, !silent);
        if (reopenAfterSave && payload.card?.record_id) openCard(payload.card.record_id);
      } finally {
        setCardSavingState(false);
      }
    }

    async function addComment() {
      if (!state.currentCard?.record_id) {
        setStatus("drawer-status", t("statusCommentNeedsSave"));
        return;
      }
      const body = document.getElementById("comment-body").value.trim();
      if (!body) return;
      const payload = await fetchJson(apiUrl(`/admin/tracking/cards/${state.currentCard.record_id}/comments`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      });
      state.currentCard = structuredClone(payload.card);
      const index = state.cards.findIndex((card) => Number(card.record_id) === Number(payload.card.record_id));
      if (index >= 0) state.cards[index] = payload.card;
      document.getElementById("comment-body").value = "";
      renderComments();
      renderHistory();
      setStatus("drawer-status", t("statusCommentAdded"));
    }

    async function deleteCurrentCard() {
      if (!state.currentCard?.record_id) {
        closeDrawer();
        return;
      }
      if (!window.confirm(t("statusDeleteConfirm"))) return;
      await fetchJson(apiUrl(`/admin/tracking/cards/${state.currentCard.record_id}`), { method: "DELETE" });
      closeDrawer();
      await loadBoard();
    }

    async function toggleArchiveCurrentCard() {
      if (!state.currentCard?.record_id) {
        setStatus("drawer-status", t("statusArchiveNeedsSave"));
        return;
      }
      const nextArchived = !Boolean(state.currentCard.archived);
      if (!window.confirm(t(nextArchived ? "statusArchiveConfirm" : "statusRestoreConfirm"))) return;
      await saveCard({
        ...readFormCard(),
        archived: nextArchived
      }, state.currentCard.record_id, true);
      setStatus("drawer-status", t(nextArchived ? "statusArchived" : "statusRestored"));
    }

    async function createCardFromFreeText() {
      const text = document.getElementById("quick-note").value.trim();
      if (!text) {
        setStatus("quick-status", t("statusNeedFreeText"));
        return;
      }
      setStatus("quick-status", t("statusCreating"));
      const payload = await fetchJson(apiUrl("/admin/tracking/ai/draft"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          langue_source: state.lang,
          source: "free_text",
          create: true
        })
      });
      if (payload.card?.record_id) {
        document.getElementById("quick-note").value = "";
        setStatus("quick-status", payload.warnings?.join(" ") || t("statusCreated"));
        await loadBoard();
        openCard(payload.card.record_id);
      }
    }

    async function translateCurrentCard(targetLanguage) {
      const card = readFormCard();
      setStatus("translation-status", t("statusTranslating"));
      const payload = await fetchJson(apiUrl("/admin/tracking/ai/translate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card, target_language: targetLanguage })
      });
      const translated = payload.translated?.fields || {};
      if (translated.titre) document.getElementById("card-titre").value = translated.titre;
      if (translated.description) document.getElementById("card-description").value = translated.description;
      if (translated.attendu) document.getElementById("card-attendu").value = translated.attendu;
      if (translated.observe) document.getElementById("card-observe").value = translated.observe;
      if (translated.contexte) document.getElementById("card-contexte").value = translated.contexte;
      setStatus("translation-status", payload.warnings?.join(" ") || t("statusTranslationApplied"));
    }

    document.getElementById("filter-search").addEventListener("input", renderBoard);
    document.getElementById("filter-archive").addEventListener("change", renderBoard);
    document.getElementById("filter-type").addEventListener("change", renderBoard);
    document.getElementById("filter-priority").addEventListener("change", renderBoard);
    document.getElementById("filter-size").addEventListener("change", renderBoard);
    document.getElementById("reload-btn").addEventListener("click", loadBoard);
    document.getElementById("reset-filters-btn").addEventListener("click", resetFilters);
    document.getElementById("new-card-btn").addEventListener("click", () => {
      state.currentCard = restoreLocalDraftIfAny(defaultCard());
      renderDrawer();
      scheduleDraftAutosave();
    });
    document.getElementById("close-drawer-btn").addEventListener("click", closeDrawer);
    document.getElementById("card-images-input").addEventListener("change", async (event) => {
      try {
        await handleImageSelection(event.target.files);
      } catch (error) {
        setStatus("drawer-status", error.message || t("statusRequestError"));
      }
    });
    async function handleSaveCurrentCard() {
      if (state.isSavingCard) return;
      const payload = readFormCard();
      await saveCard(payload, state.currentCard?.record_id || null);
    }

    document.getElementById("save-card-btn").addEventListener("click", handleSaveCurrentCard);
    document.getElementById("save-card-btn-bottom").addEventListener("click", handleSaveCurrentCard);
    document.getElementById("archive-card-btn").addEventListener("click", toggleArchiveCurrentCard);
    document.getElementById("comment-save-btn").addEventListener("click", addComment);
    document.getElementById("delete-card-btn").addEventListener("click", deleteCurrentCard);
    document.getElementById("quick-create-btn").addEventListener("click", createCardFromFreeText);
    document.getElementById("translate-en-btn").addEventListener("click", () => translateCurrentCard("en"));
    document.getElementById("translate-de-btn").addEventListener("click", () => translateCurrentCard("de"));
    document.getElementById("drawer-shell").addEventListener("click", (event) => {
      if (event.target.id === "drawer-shell") closeDrawer();
    });

    bindAutoResize();
    loadBoard().catch((error) => {
      setStatus("board-status", error.message || t("statusLoadError"));
    });
