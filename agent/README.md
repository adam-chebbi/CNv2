# Agent d'impression Café Noir

Petit programme à installer sur l'ordinateur de la caisse. Il imprime automatiquement les tickets
(caisse, bons cuisine et bar, bons d'annulation) sur les imprimantes thermiques du café et ouvre le
tiroir-caisse. Il se connecte **vers** le serveur : rien à ouvrir sur la box.

## Installation (15 minutes)

1. Installer **Node.js 18 ou plus récent** sur l'ordinateur de la caisse.
2. Copier le dossier `agent/` (par exemple dans `C:\CafeNoir\agent` ou `/opt/cafenoir-agent`).
3. Dans l'application : **Paramétrage caisse → Imprimantes & tiroir → Nouvel agent**. Noter le jeton
   affiché (il ne sera plus montré).
4. Créer `agent-config.json` à côté du programme :

   ```json
   { "serverUrl": "https://system.cafenoir.tn", "token": "cnpa_…" }
   ```

5. Lancer : `node cn-print-agent.mjs`. Le message « Agent d'impression Café Noir » doit s'afficher.
6. Dans l'application, ajouter les imprimantes de cet agent :
   - imprimante réseau : `tcp://192.168.1.50:9100` (donner une IP fixe à l'imprimante dans la box) ;
   - USB sous Linux : `file:///dev/usb/lp0` ;
   - Windows : partager l'imprimante (pilote « Generic / Text Only ») puis `share://localhost/NomDuPartage`.
7. Bouton **Page de test** pour chaque imprimante.

## Démarrage automatique

- **Windows** : service avec NSSM — `nssm install CafeNoirImpression "C:\Program Files\nodejs\node.exe" "C:\CafeNoir\agent\cn-print-agent.mjs"`.
- **Linux** : unité systemd `ExecStart=/usr/bin/node /opt/cafenoir-agent/cn-print-agent.mjs`, `Restart=always`.

## En cas de problème

- L'écran **Imprimantes & tiroir** montre l'état de l'agent (en ligne / hors ligne) et de chaque imprimante.
- Un ticket en échec est réessayé 3 fois, puis signalé ; bouton **Relancer**.
- Les écrans cuisine et bar restent la référence : un bon non imprimé reste visible à l'écran.
