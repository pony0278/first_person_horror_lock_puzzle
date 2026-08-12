/* CG6 submission-only player-facing startup hooks. */
import { installEnglishPlayerUi } from './localization.js';
import { installCrazyGamesSubmissionQa } from './crazygames-submission-qa.js';

installEnglishPlayerUi();
installCrazyGamesSubmissionQa();
