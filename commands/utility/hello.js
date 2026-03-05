const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder().setName('hello').setDescription('Replies Hi back'),
	async execute(interaction) {
		await interaction.reply(`Hi ${interaction.user.username}!`);
	},
};