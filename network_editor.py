"""Bounded Réseau validation; no I/O, schema changes or inferred consent."""
import re
from datetime import datetime, timezone

TEXT = {'Prenom': 200, 'Nom': 200, 'Organisation': 300, 'Fonction': 300,
        'Email': 254, 'Telephone': 50, 'Pays': 100, 'Introduit_par': 300,
        'Notes': 10000, 'Proprietaire_contact': 300}
CHOICES = ('Type_contact', 'Source_contact', 'Newsletter_statut')
DATES = ('Date_premier_contact', 'Date_consentement', 'Derniere_interaction')
FIELDS = frozenset(TEXT) | set(CHOICES) | set(DATES)


def validate(payload, choices, owners, current_user, existing=None):
    creating = existing is None
    if not isinstance(payload, dict) or set(payload) - (FIELDS | ({'Actif'} if not creating else set())):
        raise ValueError('Champs inconnus ou automatiques interdits.')
    values = dict(existing or {})
    changes = {}
    if creating:
        changes.update(Actif=True, Newsletter_statut='Non sollicité',
                       Date_consentement=None, Proprietaire_contact=current_user)
    for key, value in payload.items():
        if key == 'Actif':
            if type(value) is not bool:
                raise ValueError('Actif : choisissez Oui ou Non.')
        elif key in DATES:
            if value in ('', None):
                value = None
            else:
                if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                    raise ValueError(f'{key} : date attendue au format AAAA-MM-JJ.')
                try:
                    value = int(datetime.strptime(value, '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp())
                except ValueError:
                    raise ValueError(f'{key} : date invalide.') from None
        else:
            if not isinstance(value, str):
                raise ValueError(f'{key} : texte attendu.')
            # Preserve an unchanged legacy owner byte-for-byte, including whitespace.
            if not (key == 'Proprietaire_contact' and not creating and value == existing.get(key, '')):
                value = value.strip()
            if len(value) > TEXT.get(key, 300) or any(ord(c) < 32 and c not in '\n\r\t' for c in value):
                raise ValueError(f'{key} : texte trop long ou caractères invalides.')
            if key in CHOICES and value not in choices[key] and not (value == '' and key != 'Newsletter_statut'):
                raise ValueError(f'{key} : choisissez une valeur proposée.')
        changes[key] = value
    values.update(changes)
    if not any(isinstance(values.get(k), str) and values[k].strip() for k in ('Prenom', 'Nom', 'Organisation')):
        raise ValueError('Renseignez au moins un prénom, un nom ou une organisation.')
    email = values.get('Email', '')
    if email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise ValueError('Email : adresse invalide.')
    phone = values.get('Telephone', '')
    if phone and (not re.fullmatch(r'[0-9+(). /#xX\-]+', phone) or not any(c.isdigit() for c in phone)):
        raise ValueError('Téléphone : format invalide.')
    if values.get('Newsletter_statut') == 'Accepté' and type(values.get('Date_consentement')) not in (int, float):
        raise ValueError('Accepté nécessite une date de consentement explicitement renseignée.')
    owner = values.get('Proprietaire_contact')
    if owner not in owners and not (not creating and owner == existing.get('Proprietaire_contact')):
        raise ValueError('Propriétaire : choisissez un utilisateur actif.')
    return {k: v for k, v in changes.items() if creating or existing.get(k) != v}
