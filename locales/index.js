const EN = require('./en')
const RU = require('./ru')

/*
    EN must be first here all the time
    that is because whc.unesco.org has the most full information in English 
    and during the database update, bot downloads english information first
    and then uses it in case there's some information missing in other languages
*/
const locales = {
    EN,
    RU,
    common: 'После периода неактивности, начать работу с ботом нужно командой /start\nAfter an inactivity period, please send /start command to bot.'
}

module.exports = locales