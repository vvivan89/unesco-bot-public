const request = require('request');
const cheerio=require('cheerio');
const mongoose=require('mongoose');
const locales = require('./locales/index')
const csv=require('./csv');
const fs=require('fs');
require('./models.js');

/*
    module used to fill database with data from whc.unesco.org
    pdate (annual new incsriptions to the list) mechanics are not deined
    to update, it is possible to kill all collections manually and let the bot to fill the database once again
*/
mongoose.Promise = global.Promise;

const getList=mongoose.model('unesco');

/*
    data processing from remote website (xml format) and from backup csv file with locations
    full location list is not provided in xml on the website (only one location is provided)
    it requires a manual work to collect all locations if there are more than one 
*/
async function readData (URL, lang,counter) {
    //read csv file and get the array of locations
    const locations = await csv.CSVToArray(fs.readFileSync('./UnescoLocations.csv', 'utf8'), ';');

    //get xml data for the current language
    request (URL, (error, response, body) => {
        //if server error, do nothing, else we have data to process
        if (!error && response.statusCode===200 ) {

            //parse XML with cheerio
            const $ = cheerio.load(body);
            $('row')
            .each((i, objectWHC) => {
                //get XML top row structure
                const rowXML = $(objectWHC).html();

                //get data for current site and clear all html tags from it
                //also add locations if there are more than one
                const name=parse(rowXML, 'site');
                const id=parse(rowXML, 'id_number');
                const locArray=locations.filter(item=>item.siteID===id);
                const country=parse(rowXML, 'states').split(',').sort().map(item=>item.trim());

                //by default, use location from XML, but put it into single-item array
                let itemLocations=[{
                    name,
                    latitude: parse(rowXML, 'latitude'),
                    longitude: parse(rowXML, 'longitude'),
                    country:country[0],
                }];

                //but if .csv file contains list of locations for this site, use it instead
                if (locArray.length>0){
                    itemLocations=locArray.map(loc=>{
                        const {name, latitude, longitude}=loc;
                        //.csv file contains country names in languages that are used by the bot
                        //if new language added, this need to be changed
                        const ctr=lang==='EN'? loc.countryEN:loc.countryRU; 
                        return {
                            name,
                            latitude,
                            longitude,
                            country: ctr,
                        }
                    })
                }

                //get all parsed information together
                const item = {
                    locale: lang,
                    criteria: parse(rowXML, 'criteria_txt').match(/\((i+v*|vi*|i*x)\)/g), //convert criteria to array instead of string
                    id,
                    year: parse(rowXML, 'date_inscribed'),
                    name,
                    category: parse(rowXML, 'category'),
                    region: parse(rowXML, 'region'),
                    country,
                    locations:itemLocations,
                    text: parse(rowXML, 'short_description'),
                    URL: parse(rowXML, 'http_url'),
                    noInfo: false
                };

                //now check if there's no information in current language, add English information
                enhance(item).then(enhancedItem => {
                    //save item to database
                    enhancedItem.save()
                        .then(() => {
                            //if we parsed all items in one language, move to next language recursively
                            if (i === $('row').length - 1) {
                                counter++;
                                if (Object.values(locales)[counter]) {
                                    readData(Object.values(locales)[counter].URL, Object.values(locales)[counter].name, counter)
                                } else {
                                    //if all languages are done, finish updates
                                    console.log('Database update finished ' + Date())
                                }
                            }
                        })
                        .catch(e => {console.log( e)})
                });
            });
        }
    });
}

//For the ease of search, I replace names that are not used by general public
//regardless of the political preferences, site in Jerusalem de-facto controlled by Israel
const exceptions =[
    {
        text:'Иерусалим (объект, предложенный Иорданией)',
        replace:'Израиль'
    },
    {
        text:'*Святой Престол',
        replace:'Ватикан (Святой Престол)'
    },
    {
        text:'Holy See',
        replace:'Vatican (Holy See)'
    },
    {
        text:'Jerusalem (Site proposed by Jordan)',
        replace:'Israel'
    },
];

//check if country names have values that I don't want (see above) and replaces them
function checkExceptions(text) {
    for(let i=0;i<exceptions.length;i++) {
        if (text.includes(exceptions[i].text)) {
            return text.replace(exceptions[i].text, exceptions[i].replace)
        }
    }
    return text
}

//remove html tags and special symbols (like &nbsp;) from text, as bot uses markdown parsing mode
function parse (body, tag) {
    let parsedText=checkExceptions(cheerio.load(body)(tag).text()); //country name replacement, see above
    parsedText = parsedText.replace(/<\s*[^>]*>/g,''); //tags
    parsedText = parsedText.replace(/&#?[a-z0-9]+;/g, '') //special sybmols
    return parsedText;
}

//add English info if localized info is missing
async function enhance(item) {
    //if there's no info in the particular language, there always will be no name 
    if (item.name==='') {
        const englishItem= await getList.find({locale: 'EN', id:item.id});
        if(englishItem.length!==0) {
            item.noInfo = true; //user will be notified if info in their preferred language is missing
            item.name = englishItem[0].name;
            item.locations[0].name = englishItem[0].name;
            item.text = englishItem[0].text;
        }
    }
    return new getList(item); //return the item with link to database on order for it to be saved
}

//export to main module
module.exports = {
    //function actually deletes everything that is inside the database
    //then downloads all the data again
    refreshDatabase() {
        console.log('Database update started ' + Date());
        getList.deleteMany({}).then(()=>{
            //readData is recursive, so here only first iteration is invoked
            readData(Object.values(locales)[0].URL,Object.values(locales)[0].name, 0)
        })
    }
};

