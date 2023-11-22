const { translate, AVAILABLE_LANGUAGES } = require('./translate');
const { EXCEPTION_WORDS } = require('./exception-words')

module.exports = class Translator {
  constructor(mod) {
    this.mod = mod;
    this.addCommand();
    this.setupHooks();

    /*this.mod.game.on('leave_loading_screen', () => {
      if (mod.settings.sendMode) {
        this.mod.command.message(`Send Mode Enabled. Translating outgoing messages to ${this.mod.settings.sendLang}.`);
        this.mod.command.message('Use "/8 translate send off" to disable it.');
      }
    });*/
  }

  setupHooks() {
    const incomingMsgHandler = async (packet, version, event) => {
      const sanitizedMessage = this.sanitizeMessage(event.message);
      const potentialyJunkMsg = sanitizedMessage
        .replace(/[^a-z\s]/gmi, '')
        .trim()
        .toLowerCase();

      if (!this.mod.settings.enabled
        || this.mod.game.me.is(event.gameId)
        || sanitizedMessage.replace(/[^a-zа-я]/gmi, '').length < 2
        || EXCEPTION_WORDS.includes(potentialyJunkMsg)
      ) return;
      
      if (this.mod.settings.targetLang === 'ru'
        && !!sanitizedMessage.match(/[а-яё]/gmi)
      ) return;

      const translateData = await this.translate(sanitizedMessage, { target: this.mod.settings.targetLang, source: this.mod.settings.sourceLang });
      if (!translateData) return;

      this.mod.send(packet, version, { ...event, message: `<FONT>[${translateData.sourceLang}]: ${translateData.text}</FONT>` });
    };

    const outgoingMessageHandler = (packet, version, event) => {
      const sanitizedMessage = this.sanitizeMessage(event.message).trim()

      if (!this.mod.settings.enabled
        || !this.mod.settings.sendMode
        || !sanitizedMessage.startsWith('.')
      ) return;

      (async () => {
        const translateData = await this.translate(sanitizedMessage.slice(1, sanitizedMessage[sanitizedMessage.length]), { source: 'auto', target: this.mod.settings.sendLang });
        if (!translateData) return this.mod.send(packet, version, event);

        this.mod.send(packet, version, { ...event, message: `<FONT>${translateData.text}</FONT>` });
        this.mod.command.message(`Orig:(${translateData.sourceLang}-${this.mod.settings.sendLang}): ${sanitizedMessage}`);
      })();

      return false;
    };

    const CHAT_SERVER_PACKETS = [
        ['S_CHAT', this.mod.majorPatchVersion >= 108 ? 4 : 3],
        ['S_WHISPER', this.mod.majorPatchVersion >= 108 ? 4 : 3],
        ['S_PRIVATE_CHAT', 1]
	  ];
    for (const [packet, version] of CHAT_SERVER_PACKETS) this.mod.hook(packet, version, { order: 100 }, event => incomingMsgHandler(packet, version, event));

    const CHAT_CLIENT_PACKETS = [['C_WHISPER', 1], ['C_CHAT', 1]];
    for (const [packet, version] of CHAT_CLIENT_PACKETS) this.mod.hook(packet, version, {}, event => outgoingMessageHandler(packet, version, event));
  }

  async translate(message, { target, source }) {
    if (message === '') return;

    const translateData = await translate(message, target, source)
      .catch(e => {
        this.mod.error(
          `Error occurred during translation, message:${message},`,
          `target: ${target},`,
          `source: ${source},`,
          'error: ', e);
        return '';
      });

    if (translateData.text === message) return;

    return translateData;
  }

  sanitizeMessage(string) {
    // delete <FONT> </FONT> tags from original event.message
    return string.replace(/<(.+?)>|&rt;|&lt;|&gt;|/g, '').replace(/\s+$/, '').toString();
  }

  addCommand() {
    this.mod.command.add('translate', {
      $default: () => {
        this.mod.settings.enabled = !this.mod.settings.enabled;
        this.mod.command.message(`Module ${this.mod.settings.enabled ? 'enabled' : 'disabled'}`);
        this.mod.saveSettings();
      },
      source: language => {
        if (!language) {
          this.mod.command.message(`Source Language: ${this.mod.settings.sourceLang}.`);
          return;
        }
        if (!AVAILABLE_LANGUAGES.includes(language)) {
          this.mod.command.message(`Error: ${language} is not a valid language. See readme for available languages. Recommended Setting: auto`);
          return;
        }
        this.mod.command.message(`Source Language set to: ${language}.`);
        this.mod.settings.sourceLang = language;
        this.mod.saveSettings();
      },
      target: language => {
        if (!language) {
          this.mod.command.message(`Target Language: ${this.mod.settings.targetLang}.`);
          return;
        }
        if (!AVAILABLE_LANGUAGES.includes(language)) {
          this.mod.command.message(`Error: ${language} is not a valid language. See readme for available languages.`);
          return;
        }
        if (language === 'auto') {
          this.mod.command.message('Error: Target Language cannot be auto.');
          return;
        }

        this.mod.command.message(`Target Language set to: ${language}.`);
        this.mod.settings.targetLang = language;
        this.mod.saveSettings();
      },
      send: language => {
        if (language === undefined) {
          this.mod.settings.sendMode = !this.mod.settings.sendMode;
          this.mod.command.message(`Send Mode: ${this.mod.settings.sendMode ? ('enabled. Language: ' + this.mod.settings.sendLang) : 'disabled.'}`);
        } else if (AVAILABLE_LANGUAGES.includes(language)) {
          this.mod.settings.sendMode = true;
          this.mod.settings.sendLang = language;
          this.mod.command.message(`Now translating outgoing messages to: ${language}`);
        } else if (language === 'off') {
          this.mod.settings.sendMode = false;
          this.mod.command.message('Send Mode Disabled.');
        } else if (language === 'on') {
          this.mod.settings.sendMode = true;
          this.mod.command.message(`Send Mode Enabled. Now translating outgoing messages to ${this.mod.settings.sendLang}.`);
        } else {
          this.mod.command.message(`Error: ${language} is not a valid language. See readme for available languages.`);
        }
        this.mod.saveSettings();
      },
    });
  }
};
