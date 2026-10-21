# Politique de confidentialité (PDC) - ChatIA-Discord

**Dernière mise à jour : 21 octobre 2026**

> **Important :** cette politique décrit le code consulté et les informations fournies pour l’instance. Elle ne permet pas de confirmer les réglages secrets du déploiement Render ni les pratiques internes des fournisseurs. L’identité civile du responsable de traitement et une adresse de contact n’ont pas été fournies ; ces éléments doivent être vérifiés et complétés avant de présenter cette politique comme définitive.

## 1. Responsable du traitement et contact

Pour l’instance publique concernée, la personne qui décide de son déploiement et des finalités du traitement est en principe responsable du traitement. Selon les informations communiquées, l’instance est exploitée par le père du créateur du code ; son identité civile n’a pas été fournie ici.

- **Nom du service :** ChatIA
- **Créateur/éditeur du code :** creator (pseudonyme)
- **Exploitant déclaré :** père du créateur du code ; identité civile non communiquée
- **Hébergement déclaré :** Render
- **Dépôt du logiciel :** https://github.com/Nolabjfjdj/ChatIA-Discord
- **Contact relatif aux données personnelles :** aucune adresse de contact dédiée n’a été fournie.

Le responsable du traitement doit mettre à disposition un moyen de contact approprié pour les demandes relatives aux données. Ne publiez pas d’informations personnelles dans une issue GitHub publique.

## 2. Données susceptibles d’être traitées

Selon l’utilisation du bot et sa configuration, les catégories suivantes peuvent être traitées :

- **Audio vocal :** segments audio reçus dans le salon vocal et enregistrés temporairement en fichiers WAV pour permettre la transcription.
- **Transcriptions :** texte reconnu à partir de la parole.
- **Messages et réponses :** contenu nécessaire au traitement de la demande et au contexte conversationnel.
- **Identifiants Discord et informations de serveur :** identifiants techniques nécessaires à l’association d’un membre, d’un serveur, d’un salon et d’une session.
- **Données techniques :** erreurs, événements de fonctionnement, horodatages et journaux de l’hébergeur.
- **Contenu des dialogues dans les journaux :** lorsque l’envoi de ces dialogues dans un salon texte Discord est activé et que le bot dispose des accès nécessaires.

Ne fournissez pas de données sensibles ou confidentielles au bot. L’audio peut contenir des informations personnelles même si l’utilisateur ne les a pas saisies sous forme de texte.

## 3. Finalités et bases juridiques

Les données peuvent être utilisées pour :
- recevoir et transcrire les interventions vocales afin de comprendre une demande ;
- générer et prononcer une réponse ;
- maintenir temporairement le contexte d’une conversation et éviter les doublons ou les échos ;
- publier les transcriptions et réponses dans le salon texte configuré, si les journaux de dialogue sont activés ;
- diagnostiquer les erreurs, protéger le service et respecter les obligations légales.

Le responsable de l’instance doit déterminer et documenter la base juridique appropriée à chaque finalité et informer les personnes concernées conformément aux règles applicables. Selon le contexte, une base juridique peut notamment être le consentement ou l’intérêt légitime, lorsque les conditions légales sont remplies. Cette politique ne prétend pas qu’une base unique convient à toutes les situations.

## 4. Audio, transcriptions et mémoire

Le code actuel crée des fichiers audio temporaires dans le dossier `tmp-recordings` et appelle une fonction de suppression dans plusieurs chemins de traitement, notamment lorsque l’audio est trop court, ignoré ou qu’une erreur survient. Le code consulté ne suffit pas à garantir que chaque fichier est supprimé dans toutes les circonstances : il faut notamment vérifier le comportement en cas d’arrêt brutal, de panne ou de problème d’hébergement. L’exploitant doit contrôler le stockage et les éventuelles sauvegardes de son environnement Render.

Le contexte conversationnel est conservé en mémoire pendant le fonctionnement du bot et limité en taille ; il n’est pas conçu comme une archive permanente et peut disparaître au redémarrage. Les journaux de dialogue sont **optionnels/configurables**, mais le code les active par défaut dans une session et permet aux personnes ayant la permission Discord « Gérer le serveur » de les activer ou désactiver avec les commandes du préfixe configuré, par défaut :
- `!logs on` : activer l’affichage des dialogues ;
- `!logs off` : désactiver l’affichage ;
- `!logs salon #salon` : choisir le salon de journalisation ;
- `!logs reset` : revenir au salon texte par défaut.

Quand ils sont activés, les messages envoyés dans Discord restent soumis aux paramètres de conservation et de suppression de Discord et aux décisions des administrateurs. Désactiver l’affichage des dialogues ne signifie pas nécessairement que tous les journaux techniques de l’hébergeur ou des fournisseurs tiers sont désactivés.

## 5. Destinataires et fournisseurs externes

Les destinataires possibles dépendent de la configuration de l’instance :

- **Discord :** connexion au serveur, salons, identifiants et messages de dialogue éventuellement publiés.
- **Google Gemini :** le code utilise ce fournisseur par défaut pour la transcription audio et la génération de réponses, sauf configuration différente.
- **Google Text-to-Speech :** le code utilise ce service pour synthétiser la réponse vocale par défaut, sauf configuration différente.
- **Render :** hébergement du processus, des fichiers temporaires et des journaux techniques de l’application.
- **Autres fournisseurs configurables dans le code :** Groq, Vertex AI et ElevenLabs disposent de paramètres dans le code. Leur présence ne prouve pas qu’ils sont activés sur l’instance publique.

L’audio ou le texte nécessaire à la transcription, à la génération ou à la synthèse vocale peut être transmis au fournisseur correspondant. Les fournisseurs externes peuvent traiter ces données conformément à leurs propres conditions, politiques de confidentialité et paramètres contractuels. Le responsable de l’instance doit vérifier la configuration réellement déployée, les conditions de traitement, les durées de conservation et les éventuels transferts hors de l’Espace économique européen ainsi que les garanties applicables.

## 6. Durée de conservation

Les durées effectives dépendent de l’instance, de l’hébergeur et des fournisseurs :

- **Audio temporaire :** le code tente de supprimer les fichiers temporaires après certains chemins de traitement ; une suppression universelle ne peut pas être garantie à partir du seul code consulté.
- **Mémoire de conversation :** temporaire, conservée en mémoire pendant l’exécution et limitée en taille.
- **Messages de dialogue envoyés dans Discord :** conservés jusqu’à leur suppression selon les paramètres Discord et les décisions des administrateurs.
- **Journaux techniques de Render et des fournisseurs :** durées définies par leurs propres politiques et contrats, à vérifier par l’exploitant.

L’exploitant doit configurer et vérifier les durées effectives de conservation de l’hébergement, des sauvegardes et des journaux.

## 7. Sécurité

Les secrets d’API et le jeton Discord doivent être conservés dans des variables d’environnement ou un gestionnaire de secrets, jamais publiés dans le dépôt. L’accès à l’hébergement, aux journaux et aux salons de dialogue doit être limité aux personnes autorisées. Aucun système ne pouvant garantir une sécurité absolue, l’exploitant doit surveiller les accès et réagir en cas d’incident.

## 8. Droits des personnes

Sous réserve des conditions prévues par la réglementation applicable, les personnes peuvent disposer de droits d’accès, de rectification, d’effacement, de limitation, d’opposition et, lorsque cela s’applique, de portabilité, ainsi que du droit de retirer un consentement lorsqu’un traitement est fondé sur celui-ci.

Pour exercer un droit, le responsable du traitement doit proposer un moyen de contact fonctionnel. Aucune adresse dédiée n’ayant été fournie à ce jour, cette politique ne donne pas de canal direct pour les demandes ; ce point doit être réglé avant publication définitive. Une réclamation peut être adressée à l’autorité de contrôle compétente, notamment la CNIL en France.

## 9. Mineurs et utilisateurs des salons vocaux

Les règles d’âge de Discord et la législation applicable doivent être respectées. Les administrateurs doivent informer clairement les membres que le bot peut traiter leur voix, transcrire leurs propos et générer des réponses à partir de ceux-ci. Ils doivent vérifier que l’utilisation du bot et les autorisations nécessaires sont appropriées dans leur contexte, notamment lorsque des mineurs sont présents.

## 10. Modifications

Cette politique peut être mise à jour si le code, les fournisseurs ou les pratiques de traitement changent. La version en vigueur est celle publiée dans le dépôt ou communiquée par l’exploitant.

---

**À vérifier avant publication définitive**
- Identifier le responsable de traitement par les mentions requises et organiser un moyen de contact fonctionnel.
- Confirmer les fournisseurs réellement activés dans l’instance Render.
- Vérifier la suppression des fichiers audio, les journaux, les sauvegardes et les durées de conservation.
- Vérifier les bases juridiques, l’information des personnes et les transferts éventuels de données.
- Informer les membres du serveur avant que le bot ne traite leur voix.
