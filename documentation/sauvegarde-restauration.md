# Sauvegarde, restauration et retour arrière

`sh deployment/backup.sh` crée backups/horodatage mode privé : pg_dump-Fc,
archive private/media, Compose et lockfile. Ne contient pas fichiers secrets ; ceux-ci
restent dans secrets/ et doivent être conservés par un processus serveur privé
approuvé. Ne pas transférer secrets ou clés privées via chat ou agents externes.
Ce backup local n'est pas un backup hors site ; réplication et fréquence restent à
choisir. Aucun cron installé sans demande d'automatisation.

Restauration : arrêter seulement app5sursync (pas PostgreSQL/INA), sauvegarder
l'étatactuel, restaurer dump dans DB de vérification avant remplacement. Pour
restauration finale validée : pg_restore --clean --if-exists dans DB syncit puis
extraire archive dans ses volumes avec UID 1001, démarrer app et vérifier santé.
Attention : restauration finale remplace les données postérieures ; approbation
spécifique requise si donnéesréelles. Ne jamais compose down-v ou purgeDocker globale.
Le dump backups/20261006T110416Z a été restauré dans une DB temporaire
indépendante sur VPS : neuf pages, zéro admin et zéro client. Cette DB a ensuite
été supprimée ; production inchangée.

Nginx : avant activation sauvegarder /etc/nginx/nginx.conf et le fichier stream
concerné (aucune cléTLS lue/copied). Si échec, restaurer fichiersconfig uniquement,
nginx -t puis reload, vérifier trois SNI INA. Release app : garder l'imageprécédente,
RELEASE_TAG et source horodatée ; migrations compatibles ou restauration DB vérifiée.
À ce stade première version sans release ancienne, ZIP original conservé et app
peut être arrêtée seule ; volumes conservés pour diagnostic.
