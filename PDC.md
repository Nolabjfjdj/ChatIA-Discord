# Politique de confidentialité (PDC) - ChatIA-Discord

**Dernière mise à jour : 21 octobre 2026**

> **À compléter avant publication :** renseigner l’identité du responsable de traitement et une adresse de contact. Cette politique décrit le fonctionnement observé dans le code du projet ; le traitement réel dépend de l’hébergement et des fournisseurs activés. Ce modèle ne remplace pas une vérification juridique.

## 1. Responsable du traitement et contact

Pour l’instance concernée, le responsable du traitement est en principe la personne ou l’organisation qui décide de son déploiement et de ses finalités.

- **Responsable du traitement :** [À COMPLÉTER : nom ou dénomination]
- **Contact pour la confidentialité et les demandes relatives aux données :** [À COMPLÉTER : adresse e-mail]
- **Dépôt du logiciel :** https://github.com/Nolabjfjdj/ChatIA-Discord

Si plusieurs personnes exploitent des instances différentes, chacune doit vérifier ses propres responsabilités et publier des informations de contact adaptées.

## 2. Données susceptibles d’être traitées

Selon l’utilisation du bot et sa configuration, les catégories suivantes peuvent être traitées :

- **Audio vocal :** courts segments audio reçus dans le salon vocal, nécessaires à la transcription.
- **Transcriptions :** texte reconnu à partir de la parole.
- **Messages et réponses :** contenu nécessaire au traitement de la demande et au contexte conversationnel.
- **Identifiants Discord et informations de serveur :** identifiants techniques nécessaires à l’association d’un membre, d’un serveur, d’un salon et d’une session.
- **Données techniques :** erreurs, événements de fonctionnement, horodatages et journaux de l’hébergeur.

Ne fournissez pas de données sensibles ou confidentielles au bot. L’audio peut contenir des informations personnelles même si l’utilisateur ne les a pas saisies sous forme de texte.

## 3. Finalités et bases juridiques

Les données peuvent être utilisées pour :
- recevoir et transcrire les interventions vocales afin de comprendre une demande ;
- générer et prononcer une réponse ;
- maintenir temporairement le contexte d’une conversation et éviter les doublons ou les échos ;
- afficher les transcriptions et réponses dans le salon de dialogue configuré, si cette fonction est activée ;
- diagnostiquer les erreurs, protéger le service et respecter les obligations légales.

Le responsable de l’instance doit déterminer et documenter la base juridique appropriée à chaque finalité. Selon le contexte, cela peut notamment relever du consentement, de l’exécution d’un service demandé ou de l’intérêt légitime, sous réserve des conditions légales applicables. Cette politique ne prétend pas qu’une base unique convient à toutes les instances.

## 4. Audio, transcriptions et mémoire

Le bot crée des fichiers audio temporaires pour traiter les interventions. Dans le fonctionnement prévu par le code, ces fichiers sont supprimés après la transcription ou lorsqu’un traitement échoue ou est ignoré. La suppression peut échouer en cas de panne du processus ou de l’hébergement ; l’exploitant doit donc contrôler le stockage et les sauvegardes de son environnement.

Le contexte conversationnel est conservé en mémoire vive pendant le fonctionnement du bot et limité en taille. Il n’est pas conçu comme une archive permanente ; il peut disparaître au redémarrage. Les journaux de dialogue peuvent, eux, être envoyés dans un salon texte Discord. Ces messages restent soumis aux paramètres de conservation et de suppression de Discord et aux règles du serveur.

Les journaux de dialogue peuvent être désactivés ou configurés par un membre disposant de la permission « Gérer le serveur » avec les commandes suivantes, selon la configuration : !logs off, !logs on, !logs salon #salon et !logs reset. Désactiver l’affichage des dialogues ne signifie pas nécessairement que tous les journaux techniques de l’hébergeur ou des fournisseurs tiers sont désactivés.

## 5. Destinataires et fournisseurs externes

Pour fonctionner, le bot peut transmettre des données aux services suivants, selon la configuration :

- **Discord :** connexion au serveur, salons, identifiants et messages de dialogue éventuellement publiés.
- **Google Gemini / Google Text-to-Speech :** audio à transcrire, texte de requête ou texte à synthétiser, selon les fonctions utilisées.
- **Groq :** audio ou texte nécessaire à la transcription et/ou à la génération, si ce fournisseur est activé.
- **ElevenLabs :** texte à prononcer et paramètres vocaux, si ce fournisseur est activé.
- **Hébergeur du bot :** données traitées en mémoire, fichiers audio temporaires et journaux techniques.

Ces fournisseurs peuvent traiter les données conformément à leurs propres conditions, politiques de confidentialité et paramètres contractuels. Le responsable de l’instance doit vérifier les fournisseurs réellement activés, leurs conditions de traitement, les durées de conservation, ainsi que les transferts éventuels hors de l’Espace économique européen et les garanties applicables.

## 6. Durée de conservation

Les durées dépendent de l’instance, de l’hébergeur et des fournisseurs :

- **Audio temporaire :** normalement supprimé après transcription ou échec du traitement ; des fichiers peuvent subsister en cas d’interruption ou de défaillance.
- **Mémoire de conversation :** temporaire, conservée en mémoire vive pendant l’exécution et limitée en taille.
- **Messages de dialogue envoyés dans Discord :** conservés jusqu’à leur suppression selon les réglages Discord et les décisions des administrateurs.
- **Journaux techniques de l’hébergeur et des fournisseurs :** durée définie par leurs propres politiques et contrats.

L’exploitant doit configurer et vérifier les durées effectives de conservation de son hébergement, des sauvegardes et des journaux.

## 7. Sécurité

Les secrets d’API et le jeton Discord doivent être conservés dans des variables d’environnement ou un gestionnaire de secrets, jamais publiés dans le dépôt. L’accès à l’hébergement, aux journaux et aux salons de dialogue doit être limité aux personnes autorisées. Aucun système ne pouvant garantir une sécurité absolue, l’exploitant doit surveiller les accès et réagir en cas d’incident.

## 8. Droits des personnes

Sous réserve des conditions prévues par la réglementation applicable, les personnes peuvent disposer de droits d’accès, de rectification, d’effacement, de limitation, d’opposition et, lorsque cela s’applique, de portabilité, ainsi que du droit de retirer un consentement.

Pour exercer un droit ou poser une question, contactez le responsable du traitement à l’adresse indiquée à la section 1. Ne publiez pas d’informations personnelles dans une issue GitHub publique. Le responsable pourra demander des informations raisonnables pour vérifier l’identité du demandeur et répondre dans les délais légaux. Une réclamation peut également être adressée à l’autorité de contrôle compétente, notamment la CNIL en France.

## 9. Mineurs

Les règles d’âge de Discord et la législation applicable doivent être respectées. Les administrateurs doivent expliquer clairement aux membres que le bot peut traiter leur voix et faire transcrire leurs propos. Si une autorisation parentale est requise dans le contexte concerné, elle doit être obtenue avant l’utilisation.

## 10. Modifications

Cette politique peut être mise à jour si le code, les fournisseurs ou les pratiques de traitement changent. La version en vigueur est celle publiée dans le dépôt ou communiquée par l’exploitant.

---

**Liste de vérification avant publication**
- Remplacer tous les champs « À COMPLÉTER ».
- Confirmer l’identité du responsable de traitement et un contact qui fonctionne.
- Vérifier les fournisseurs et réglages réellement activés dans l’instance.
- Vérifier la suppression des fichiers audio, les journaux, les sauvegardes et les durées de conservation sur l’hébergement.
- Informer les membres du serveur avant que le bot ne traite leur voix.
