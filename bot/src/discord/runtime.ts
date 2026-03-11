import {
  ChannelType,
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
  type VoiceBasedChannel,
} from 'discord.js'
import { GuildAudioSession } from '../audio/guild-audio-session.js'
import type { SpeakerCaptureOptions } from '../audio/speaker-capture-session.js'
import type { Logger } from '../lib/logger.js'

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join a voice channel and start meme matching')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Optional voice channel override')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the active voice channel'),
]

const requiredChannelPermissions = [
  {
    label: 'ViewChannel',
    permission: PermissionsBitField.Flags.ViewChannel,
  },
  {
    label: 'Connect',
    permission: PermissionsBitField.Flags.Connect,
  },
  {
    label: 'Speak',
    permission: PermissionsBitField.Flags.Speak,
  },
] as const

export class DiscordBotRuntime {
  readonly client: Client
  private readonly sessions = new Map<string, GuildAudioSession>()

  constructor(
    private readonly apiBaseUrl: string,
    private readonly captureOptions: SpeakerCaptureOptions & {
      daveEncryption: boolean
      enableTextCommands: boolean
    },
    private readonly logger: Logger,
  ) {
    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
    ]

    if (this.captureOptions.enableTextCommands) {
      intents.push(GatewayIntentBits.GuildMessages)
      intents.push(GatewayIntentBits.MessageContent)
    }

    this.client = new Client({
      intents,
    })
  }

  async start(token: string): Promise<void> {
    this.client.once(Events.ClientReady, (readyClient) => {
      this.logger.info('Discord bot ready', {
        user: readyClient.user.tag,
      })
    })
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) {
        return
      }

      void this.handleInteraction(interaction)
    })
    if (this.captureOptions.enableTextCommands) {
      this.client.on(Events.MessageCreate, (message) => {
        void this.handleMessage(message)
      })
    }

    await this.client.login(token)
  }

  private getMissingChannelPermissions(channel: VoiceBasedChannel) {
    const botUserId = this.client.user?.id
    const botPermissions = botUserId ? channel.permissionsFor(botUserId) : null

    return botPermissions
      ? requiredChannelPermissions.filter(
          ({ permission }) => !botPermissions.has(permission),
        )
      : []
  }

  private async connectSession(
    channel: VoiceBasedChannel,
    allowReplace: boolean,
  ) {
    const guildId = channel.guild.id
    const existing = this.sessions.get(guildId)

    if (existing) {
      if (existing.channelId === channel.id) {
        return {
          replaced: false,
          session: existing,
        }
      }

      if (!allowReplace) {
        throw new Error(
          `Bot is already active in ${existing.channelName}. Join that channel or use /leave first.`,
        )
      }

      existing.destroy()
      this.sessions.delete(guildId)
    }

    const session = new GuildAudioSession(
      this.client,
      channel,
      this.apiBaseUrl,
      this.captureOptions,
      this.captureOptions.daveEncryption,
      this.logger,
    )
    await session.initialize()
    this.sessions.set(guildId, session)

    return {
      replaced: Boolean(existing),
      session,
    }
  }

  private async replyToMessage(message: Message, content: string) {
    try {
      await message.reply({
        allowedMentions: {
          repliedUser: false,
        },
        content,
      })
    } catch (error) {
      this.logger.warn('Failed to send text command reply', {
        channelId: message.channelId,
        error: error instanceof Error ? error.message : String(error),
        guildId: message.guildId,
      })
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.inGuild() || !message.guildId) {
      return
    }

    const content = message.content.trim()

    if (!content.toLocaleLowerCase('tr-TR').startsWith('meme!play')) {
      return
    }

    const query = content.slice('meme!play'.length).trim()

    if (!query) {
      await this.replyToMessage(message, 'Usage: `meme!play <aranacak ifade>`')
      return
    }

    const guildMember =
      message.member ??
      (await message.guild.members.fetch(message.author.id).catch(() => null))
    const activeSession = this.sessions.get(message.guildId)

    if (activeSession) {
      if (guildMember?.voice.channelId !== activeSession.channelId) {
        await this.replyToMessage(
          message,
          `Bot şu an \`${activeSession.channelName}\` kanalında aktif. O kanala katıl ya da \`/leave\` ile oturumu kapat.`,
        )
        return
      }

      await this.playFromTextQuery(message, activeSession, query)
      return
    }

    const voiceChannel = guildMember?.voice.channel

    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
      await this.replyToMessage(
        message,
        'Önce bir ses kanalına katıl, sonra `meme!play <ifade>` yaz.',
      )
      return
    }

    const missingPermissions = this.getMissingChannelPermissions(voiceChannel)

    if (missingPermissions.length > 0) {
      await this.replyToMessage(
        message,
        `Bot bu ses kanalında şu izinlere ihtiyaç duyuyor: ${missingPermissions
          .map(({ label }) => label)
          .join(', ')}.`,
      )
      return
    }

    try {
      await this.replyToMessage(
        message,
        `\`${voiceChannel.name}\` kanalına bağlanıp \`${query}\` için eşleşme arıyorum...`,
      )
      const { session } = await this.connectSession(voiceChannel, false)
      await this.playFromTextQuery(message, session, query)
    } catch (error) {
      this.logger.error('Failed to handle text playback command', error, {
        guildId: message.guildId,
        query,
      })
      await this.replyToMessage(
        message,
        `Komut çalıştırılırken hata oluştu: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
    }
  }

  private async playFromTextQuery(
    message: Message,
    session: GuildAudioSession,
    query: string,
  ) {
    try {
      const response = await session.playTextQuery(query)

      if (response.status !== 'matched') {
        await this.replyToMessage(
          message,
          `\`${query}\` için uygun bir meme bulunamadı.`,
        )
        return
      }

      await this.replyToMessage(
        message,
        `Çalınıyor: \`${response.match.fileName}\` (${response.match.similarity.toFixed(
          2,
        )})`,
      )
    } catch (error) {
      this.logger.error('Failed to play meme from text query', error, {
        channelId: session.channelId,
        guildId: message.guildId,
        query,
      })
      await this.replyToMessage(
        message,
        `Arama veya playback sırasında hata oluştu: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
    }
  }

  private async handleInteraction(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({
        content: 'This bot only works inside a guild voice channel.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (interaction.commandName === 'join') {
      await this.handleJoin(interaction)
      return
    }

    if (interaction.commandName === 'leave') {
      await this.handleLeave(interaction)
    }
  }

  private async handleJoin(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const guildId = interaction.guildId

    if (!guildId) {
      await interaction.reply({
        content: 'This bot only works inside a guild voice channel.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const guildMember = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => null)
    const selectedChannel =
      interaction.options.getChannel('channel') ?? guildMember?.voice.channel

    if (
      !selectedChannel ||
      selectedChannel.type !== ChannelType.GuildVoice ||
      !('permissionsFor' in selectedChannel)
    ) {
      await interaction.reply({
        content:
          'Join a voice channel first or pass a guild voice channel to `/join`.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const missingPermissions = this.getMissingChannelPermissions(
      selectedChannel as VoiceBasedChannel,
    )

    if (missingPermissions.length > 0) {
      await interaction.reply({
        content: `Bot is missing required channel permissions: ${missingPermissions
          .map(({ label }) => label)
          .join(', ')}.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    await interaction.editReply(
      `Joining ${selectedChannel.name} and waiting for the voice connection to become ready...`,
    )

    try {
      await this.connectSession(selectedChannel as VoiceBasedChannel, true)

      await interaction.editReply(
        `Connected to ${selectedChannel.name}. Listening for semantically complete segments.`,
      )
    } catch (error) {
      this.logger.error('Failed to join voice channel', error)
      const errorMessage =
        error instanceof Error ? error.message : 'unknown error'

      await interaction.editReply(
        `Failed to join ${selectedChannel.name}. Voice connection did not become ready: ${errorMessage}.`,
      )
    }
  }

  private async handleLeave(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const guildId = interaction.guildId

    if (!guildId) {
      await interaction.reply({
        content: 'This bot only works inside a guild voice channel.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const session = this.sessions.get(guildId)

    if (!session) {
      await interaction.reply({
        content: 'There is no active session in this guild.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    session.destroy()
    this.sessions.delete(guildId)
    await interaction.reply({
      content: 'Left the voice channel and cleared pending playback.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
