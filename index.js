const { Composer, session } = require("micro-bot");
const mongoose = require('mongoose');
const locales = require('./locales/index')
const refreshDB = require('./refreshDB') 
const screenVar = require('./screens')
require('./models.js');

//descructure components of screens import
const {screens, criteriaArray} = screenVar

//-------------------------- Init bot --------------------------//
const bot = new Composer();
bot.use(session());
bot.init = async (mBot) => {
	bot.telegram = mBot.telegram;
};

//-------------------------- Connect to MongoDB --------------------------//
const {mongoURI}=process.env;
mongoose.Promise = global.Promise;
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MondoDB: connected successfully'))
.catch(e => console.log('MongoDB error: ',e.message));

//database instances
const getLocale=mongoose.model('locales');
const getList=mongoose.model('unesco');

// Check if the database is empty, then try to load from whc.unesco.org
getList.find({}).then(list => {
    if (list.length === 0) {
        refreshDB.refreshDatabase()
    }
})

// ------------- Bot input events ---------------------//

/*
    commands are actually sent to bot as text
    it is possible to handle them as bot.command()
    but text handling is just more explicit
*/

// Command "/start" that sends the description of possible actions to the user
bot.hears(/\/start/, async (ctx) => {
    //always get localized variables first
    const loc = await getChatLocale(ctx)

    //remove all previous session data if there was any
    clear(ctx)

    //show "Greeting" screen (see "screens.js")
    await commonScreens(loc, ctx, 'greeting','','',true)
});

// Command "/lang" that will show available languages for the user
bot.hears(/\/lang/, async (ctx) => {
    //always get localized variables first
    const loc = await getChatLocale(ctx)

    //remove all previous session data if there was any
    clear(ctx)

    //show "Language" screen (see "screens.js")
    await commonScreens(loc, ctx, 'language')
});

//any other text (user search, etc.)
bot.hears(/^((?!.*(\/start|\/lang).*).)*$/, async (ctx) => {
    //always get localized variables first
    const loc = await getChatLocale(ctx)

    /*
        location cannot be sent with inline keyboard
        it always has to be button keyboard, that do not send callback data, the send text messages instead
        to remove this if the user decided not to send location, "back" button is used
        it sends "go back" message which is handled differently than a search message
    */
    if (ctx.message.text===loc.buttonsGPS.back){
        //forcedly send a new message that will remove the button keyboard
        await message(ctx,loc.strings.closeKeyboard,{reply_markup: {remove_keyboard: true}}, true)

        //clear the search if there was any
        ctx.session.search = null

        //go to main screen
        await commonScreens(loc,ctx,'greeting')
    } else if(['resultList', 'siteDetails', 'locationList'].includes(ctx.session.status)) {
            //if user sends text in the wrong moment bot will not do anything with it
            //but will ask user if they want to cancel current operation and start a new search
            await commonScreens(loc,ctx,'cancelSearch')

    //the actual search handling
    } else {
        ctx.session.status = 'search'
        let text = ctx.message.text

        //if massage is a number from 1 to 10, this is a criteria search
        //so we convert the number to a criteria in the source format "(vii)"
        if (Number(text) >= 1 && Number(text) <= 10) {
            text = criteriaArray[text-1]
        }

        //if this is the first search in this session, create an empty object to avoid error
        const newSearch=ctx.session.search || {}

        //modify the search string
        ctx.session.search={
            ...newSearch,
            text: appendSearch(newSearch.text || '', text)
        }

        //handle the search (location as well as text search)
        await searchItems(loc, ctx)
    }
});

//when user sends their location, bot searches nearest items
bot.on('location', async (ctx)=>{
    //always get localized variables first
    const loc = await getChatLocale(ctx)

    //the actual search handling
    ctx.session.status = 'search'
    const {latitude, longitude} = ctx.message?.location

    //if this is the first search in this session, create an empty object to avoid error
    const newSearch=ctx.session.search || {}
    ctx.session.search = {
        ...newSearch,
        latitude,
        longitude
    }
    //forcedly send a new message that will remove the button keyboard
    await message(ctx,loc.strings.searchInProgress,{reply_markup: {remove_keyboard: true}}, true)

    //handle the search (location as well as text search)
    await searchItems(loc, ctx)
})

//inline keyboard buttons invoke "callback" calls
//callback_data can only be a string, so data with some variables has to be parsed
bot.on("callback_query", async (ctx) => {
    //always get localized variables first
    let loc = await getChatLocale(ctx)

    //if inline button is pressed after bot restart, locale could not be found
    //we shoe notification about it and ask user to send "/start" command
    if (!loc) {
        await message(ctx, locales.common, {},true)
        return
    }
    //get the callback data
    const req = ctx.callbackQuery.data;

    //case 1: user selects language, callback data will be equal to the locale name
    const possibleLocales = Object.keys(locales)
    if (possibleLocales.includes(req)) {
        //save user preference to the database
        await setChatLocale(ctx, req)

        //return to the home screen with the new language
        await commonScreens(ctx.session.locale, ctx, 'greeting','','',true)

    //case 2: user changes the distance from their location to search for sites
    } else if (req.startsWith('dist_')) {
        //if search with the new distance gives zero results, this variable will tell the bot to show distance buttons
        //unlike the text search with zero results
        ctx.session.distanceMoved = true

        //get the new distance that user wants to search
        const modifier = req.split('_')[1] //number with a sign
        const sign=modifier.substr(0,1) //sign
        const num = Number(modifier.substr(1)) //number
        const additionalDist = num*(sign==='+' ? 1 : -1) //plus or minus the number
        ctx.session.searchResult.distance = Math.max(1, additionalDist+ctx.session.searchResult.distance) //calculate the new distance

        //search for the items once again
        await searchItems(loc, ctx)
    
    //case 3: user wants to see site details
    } else if (req.startsWith('full_')) {
        //change status because we don't want to handle user input in this session anymore
        ctx.session.status = 'siteDetails'

        //get the site index in the array of found sites
        const index=Number(req.substr(5))

        //set the site info to the session variable
        ctx.session.site={
            index,
            locationIndex:null,
            locationStart:0
        }

        //show site details
        await showSiteDetails(loc,ctx)

    //case 4: user navigates through the site list
    //list is displayed by 10 items in one message and shows pagination arrows
    } else if (req.startsWith('start')) {
        //get the direction, where user wants to go
        const dir=req.substr(5,1)

        //+ means go forward, minus - go back
        const num = 10*(dir==='+' ? 1 : -1)

        //calculate the new start position that could not be below zero
        ctx.session.searchResult.start=Math.max(ctx.session.searchResult.start+num, 0)

        //show the new part of the site list
        await showSiteList(loc,ctx)

    //case 5: user navigates through the site locations list
    //logic is same as above
    } else if (req.startsWith('locationStart')) {
         //get the direction, where user wants to go
        const dir=req.substr(13,1)

        //+ means go forward, minus - go back
        const num = 10*(dir==='+' ? 1 : -1)

        //calculate the new start position that could not be below zero
        ctx.session.site.locationStart=Math.max(ctx.session.site.locationStart+num, 0)

        //show the new part of the locations list
        await showLocationList(loc,ctx)

    //case 6: user wants to see particular location of the particular site
    } else if (req.startsWith('locationDetails_')) {
        //get the location index in the array locations of the current site
        const index=Number(req.substr(16))
        ctx.session.site.locationIndex=index

        //get the location GPS data
        const {latitude, longitude} = ctx.session.searchResult.siteList[ctx.session.site.index].locations[index]

        //send message with location (telegram does not allow to add text or buttons to it)
        await ctx.replyWithLocation(latitude, longitude)

        //send message with buttons to invite user to return to search results, site details, etc.
        await commonScreens(loc, ctx, 'locationShown', '', ctx.session.site.index, true)

    //case 7: user wants to start search with criteria from the screen that describes all criteria
    } else if (req.startsWith('criteria_')) {

        //get the criteria that user wants to search
        const crit = req.split('_')[1]

         //if this is the first search in this session, create an empty object to avoid error
        const newSearch=ctx.session.search || {}
        ctx.session.search={
            ...newSearch,
            text: appendSearch(newSearch.text || '', crit)
        }

        //search
        await searchItems(loc, ctx)

    //other callback data cases, where string parsing is not required
    } else {
        switch(req){
            case 'search_gps':
                //user want to send the location, but it is not possible with inline buttons
                //so we ask user to press the keyboard button to send location
                const location_kb = {
                    reply_markup: {
                        keyboard: [[
                            {text: loc.buttonsGPS.send, request_location: true},
                            {text: loc.buttonsGPS.back}
                            ]],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                }
                await message(ctx,loc.strings.sendGPS,location_kb, true)
            break;
            case 'home_screen':
                //all "start new search" buttons lead here
                //we do a cleanup of all session variables
                clear(ctx)

                //and show the main screen
                await commonScreens(ctx.session.locale, ctx, 'greeting','','',true)
            break;
            case 'show_search_results':
                //user is satisfied with the number of found items and wants to see the list
                //or they return from the details of some other site back to the list

                //if there's only one site in the search, no point in showing the list
                const count = ctx.session.searchResult?.siteList?.length
                if(count===1){
                    ctx.session.status = 'siteDetails'

                    //show the details right away
                    ctx.session.site={
                        index:0,
                        locationIndex:null,
                        locationStart:0
                    }
                    await showSiteDetails(loc,ctx)
                } else {
                    ctx.session.status = 'resultList'

                    //if previously we showed a particular site, now we do not want to have information about it
                    ctx.session.site = null
                    
                    //send the list
                    await showSiteList(loc,ctx)
                }
            break;
            case 'info_country':
                //user wants to see all the countries that have UNESCO sites with the number of sites for each country
                //this screen is just informational
                const countries = await getCountryList(ctx.session.siteList)
                await commonScreens(loc,ctx,'countryList',countries.string)
            break;
            case 'info_criteria':
                //bot sends description of all unesco criteria
                //also there are buttons that allow user to start search directly from that screen
                await commonScreens(loc,ctx,'criteriaList')
            break;
            case 'no_cancel_search':
                //if user sends text in the wrong moment bot will not do anything with it
                //but will ask user if they want to cancel current operation and start a new search
                //and if user does not want to cancel this search, bot will duplicate the message from the last user interaction stage
                if(ctx.session.status==='resultList'){await showSiteList(loc,ctx)}
                if(ctx.session.status==='siteDetails'){await showSiteDetails(loc,ctx)}
                if(ctx.session.status==='locationList'){await showLocationList(loc,ctx)}
            break;
            case 'show_location_list':
                //bot will send the list of locations for the particular site (available from site details screen)
                ctx.session.status = 'locationList'
                await showLocationList(loc,ctx)
            break;
        }
    }
})

// ------------- Bot output actions ---------------------//

//bot selects one screen from predefines (see "screens.js") and sends it to the user
async function commonScreens(loc, ctx, name, upperText='', lowerText='', newMessage=false, kbMap=[]) {

    //get the screen from "screens.js"
    const { text, kb } = screens(loc, name,upperText,lowerText)

    //in some screens, dome keyboard buttons must be hidden
    //so if the keyboard layout is passed to the function, we hide unwanted buttons
    let mappedKB = kb

    //kbMap must be an array of arrays (same as inline_keyboard)
    if(kbMap?.length){
        //first layer defines rows of buttons
        mappedKB=kb.map((row, i)=>{
            //nested arrays define each button in a row
            return row.map((btn,j)=>{
                //if we don't want to show particular button, kbMap will have a Boolean "false" item in the array
                //if there is no such item (undefined), the button must stay
                if(kbMap[i] && kbMap[i][j]===false ){
                    return null
                }
                return btn
            //remove nulls
            }).filter(item=>item)
        //remove rows without buttons
        }).filter(item=>item && item.length>0)
    }
    //send message with the markup from "screens.js" with or without alternations to keyboard
    const markup = {reply_markup: { inline_keyboard: mappedKB || {} }}
    await message(ctx, text, markup,newMessage)
}

//gets language preferred by the user
//call each time when user sends something to the bot
async function getChatLocale(ctx, forced=null) {
    //if there's no set language for this chat, we need to detect it
    if (!ctx.session?.locale) {

        //forced used if bot is unable to get chat id for this session
        let loc=forced

        //if there was a message sent by the user, we can get chat ID from it
        //end then try to find it in the database
        if(ctx.message) {
            const localeList = await getLocale.find({ chatID: ctx.message.chat.id }).limit(1)
            if(localeList.length > 0){loc = localeList[0].locale}
            //set chatID as well, because when user sends callback data, it is hard to get the chat id from it
            ctx.session.chatID = ctx.message.chat.id
        }

        //save localized stings to the session storage of current chat
        ctx.session.locale = locales[loc]

        //find all info about UNESCO sited for the preferred language and store it so session
        //to speed up the search process in the future
        const siteList = await getList.find({ locale: loc });
        ctx.session.siteList = siteList.map(item=>item._doc)
    }
    //if language for this chat is already set, just return it
    return ctx.session.locale
}

//when user changes preferred language using "/lang" command
async function setChatLocale(ctx, loc) {
    //first, search is that user already has saved language preference
    const localeList = await getLocale.find({ chatID: ctx.session.chatID }).limit(1)

    //if yes, change it and update database
    if (localeList.length !== 0) {
        localeList[0].locale = loc;
        localeList[0].save();
    } else {
    //if user never changed their language before, create new record to the database
    //store only chat ID and language currently
        const writeLocale = new getLocale({
            chatID:ctx.session.chatID,
            locale: loc
        });
        writeLocale.save();
    }

    //update information about sites with the new language
    const siteList = await getList.find({ locale: loc });
    ctx.session.siteList = siteList.map(item=>item._doc)

    //update session language
    ctx.session.locale = locales[loc]
}

//bot tries to modify existing message otherwise sends a new one
async function message(ctx,text,keyboard = {},sendNew = false,parse_mode = "markdown") {
	let newMessage = sendNew;
	const options = {
		parse_mode,
		...keyboard,
    };
    //force to send a new message
	if (newMessage) {
        ctx.replyWithMarkdown(text, options);
        
    //if we don't need a new message, try to modify the one that exists in the context
	} else {
		try {
            ctx.editMessageText(text, options);
        
        //however, such modification is not always possible, in this case send a new message
		} catch (err) {
			ctx.replyWithMarkdown(text, options);
		}
	}
}

//cleanup after user finished their search and wants to start a new one
function clear(ctx){
    ctx.session.status = ''
    ctx.session.search=null
    ctx.session.searchResult = null
    ctx.session.distanceMoved = false
    ctx.session.site = null
}

// ----------------- Search functions ------------------------//

//handling of text search as well as location search (and combining both)
async function searchItems(loc, ctx){
    let {search, siteList} = ctx.session

    //warn user that there's no location or text search
    //however, this should not happen and used as error prevention only
    if(!search){
        await commonScreens(loc, ctx, 'greeting',loc.strings.emptySearch,'',true)
        return
    }

    //combine ids of all found items
    let totalArray = []

    //text parsing ("+"" means or, "," means and)
    //also replace "+" and "," with localized "and" and "or"
    let replacedSearch = ''
    if (search.text) {
        //replace "+" with localized "or" word
        const plus = new RegExp("\\+","gi")
        replacedSearch = search.text.replace(plus, loc.strings.or)

        //and "," with localized "and" word
        const comma = new RegExp(",","gi")
        replacedSearch = replacedSearch.replace(comma,loc.strings.and)

        //substrings, where any of the can be found (at least one)
        const concats = searchToArray(search.text, '+');
        concats.forEach(part => {
            let tempResult=[]

            //substrings that all must be found within the same item
            let intersections = searchToArray(part, ',');
            intersections.forEach(item => {
                const result=[]

                //search each site separately
                siteList.forEach(site => {
                    //search substring in each key that is available for the site (year, criteria, name, description, etc.)
                    Object.entries(site).forEach(([key, value]) => {
                        //do not search in technical keys, e.g. locale and locations
                        //also exclude description ("text" key, search here will cause unpredictable results)
                        if (value && !['locations','text','locale','_id','URL','noInfo'].includes(key) &&
                            value.toString().toLowerCase().includes(item.toLowerCase())) {

                            //if a match is found, we use MongoDB ID to then get all items
                            const v = JSON.stringify(site._id)

                            //make a set of unique findings
                            if (!result.includes(v)) { result.push(v) }
                        }
                    })
                })
                //get only intersections (items that are included in both arrays)
                tempResult=mixArrays(tempResult,result)
            })
            //get all items combined, but exclude duplicates
            totalArray=mixArrays(totalArray,tempResult,true)
        })
    }

    //now, search items by location
    if(search.longitude || search.latitude){

        //get array of nearby items
        const result = await locationSearch(ctx.session.siteList, search.latitude,search.longitude, ctx.session.searchResult?.distance)
        const {distance, nearest} = result
        const newSearchResult = ctx.session.searchResult || {}
        ctx.session.searchResult={ ...newSearchResult,distance, nearest}

        //location search is always an "and" search: 
        //we only want those items that have matches with a text search AND are nearby
        if(totalArray.length>0) {
            totalArray=mixArrays(totalArray, result.items)
        } else {
            totalArray=result.items
        }
    }

    //if nothing is found, notify user and send them to the home screen
    if(!totalArray.length){
        if(!ctx.session.distanceMoved){
            //different notification with location and text search
            let text = ctx.session.searchResult?.distance ? loc.strings.noSearchResultsLocation  : loc.strings.noSearchResults

            //cleanup that will allow to start a new search
            clear(ctx)
            await commonScreens(loc, ctx, 'greeting',text.replace('%search%',(replacedSearch)),'',true)

        //if user narrowed the location search too much, let him to expand it back
        //so show distance adjustment buttons
        //and no cleanup here
        } else {
            const text = loc.strings.tooNarrowLocation.replace('%km%',ctx.session.searchResult.distance)

            //remove button "show site list" as there's nothing to show
            //and there's no point in narrowing the search anymore, so remove those buttons too
            const kbMap=[[false, true],[false, false, true, true]]
            await commonScreens(loc, ctx, 'searchResultGPS',text,'','',kbMap)
        }
        return
    }

    //now, as we have only IDs of items that are found, lets get the actual items
    let list = ctx.session.siteList
        .filter(item => totalArray.includes(JSON.stringify(item._id)))
        .sort((a, b) => a.year - b.year) //sort from oldest to newest

    //if we did perform the location search, extend all items with their distance from the user
    if(search.longitude || search.latitude){
        list = list.map(item=>{
            let d=calcDistance(item,search.latitude, search.longitude)
            return {
                ...item,
                distance: d===null ? 0 : Math.round(d)
            }
        }).sort((a, b) => a.distance - b.distance) //in this case, sort from closest to the furthest
    }

    //avoid errors mutating the result object if there was no search before
    const newSearchResult = ctx.session.searchResult || {}

    //add newly found sites to the existing search result
    //set the starting point for the site list at first element
    ctx.session.searchResult =  ctx.session.searchResult={ ...newSearchResult,siteList:list,start:0}

    //send user the actual number of sites found
    let requestText = loc.strings.foundItems.replace('%count%',list.length)
    let screenName= 'searchResult'
    let kbMap=[]

    //also show the search that user inputted
    if(search.text){
        requestText += `\n${loc.strings.request.replace('%request%',replacedSearch)}`
    }

    //with the location search, show radius of the search and the radius to the nearest site
    if(ctx.session.searchResult?.distance){
        requestText += `\n${loc.strings.requestGPS.replace('%km%',ctx.session.searchResult.distance)}.`+
            ` ${loc.strings.nearestSite.replace('%km%',ctx.session.searchResult.nearest)}`
        screenName='searchResultGPS'
        //if the radius of the search is less the 100 or 50 km, remove unwanted buttons that shrink the search radius
        if(ctx.session.searchResult?.distance<100){
            kbMap=[[true, true],[false,ctx.session.searchResult?.distance>50,true,true]]
        }
    }

    //send info about the number of found items
    //if there's only one item in the search results, the button caption will change
    //from "show list" f "show item"
    await commonScreens(loc, ctx, screenName,requestText,totalArray.length===1,false,kbMap)
}

//searches sites based on distance to the user location
async function locationSearch(list,latitude, longitude, distance=0){
    //if initial distance is zero, function will extend it until at least 3 sites are found
    //otherwise it will only search within the provided distance (because this distance is requested by user)
    const iterable = distance===0

    //first, calculate distances to all sites and pop nearest to top
    const distanceArray = list.map((item,i)=>{
        let d=calcDistance(item,latitude, longitude)
        return {
            ...item,
            distance:d===null ? 0 : Math.round(d)
        }
    }).sort((a,b)=>a.distance - b.distance)

    //show the user where is the nearest site
    const nearest = distanceArray[0].distance

    //now gradually increase the distance by 50km until we find at least 3 sites
    //or just search for sites within the defined distance if it is defined by user
    let locArray = distanceArray.filter(item=>item.distance<=distance)
    while (locArray.length <3 && distance <= 5000 && iterable) {
        distance+=50;
        locArray = distanceArray.filter(item=>item.distance<=distance)
    }

    //at this step we only need IDs of items, because we want to combine location search with text search
    locArray = locArray.map(item=>JSON.stringify(item._id))
    return {items:locArray, distance, nearest}
}

//function makes string from found sites (with short info) and sends a message to the user
async function showSiteList(loc, ctx){
    //get the start point (if he number of found items is more than 10)
    const {siteList, start} = ctx.session.searchResult

    //calculate the index of the last item that is shown in this message
    //cannot be more than the total number of items in the list
    const end = Math.min(start+10, siteList.length)

    //number of items shown
    //can be less than 10 on the last page
    const total = end - start
    
    //future message string
    let result=''

    //buttons will have indexes of items that are currently shown
    //on press they will show the site detail with particular index
    const buttons=[]

    //buttons are split to 2 rows if there are more than 5 items to show
    let row=[]

    //loop through all items that must be shown in this message
    for(let i=start;i<end;i++){
        row.push({text:(i+1).toString(), callback_data:`full_${i}`})

        //start the second row for the last half of buttons (but only if there are more than five)
        if(row.length>=total/2 && row.length>=5){
            buttons.push(row)
            row=[]
        }

        //if there was a location provided, show distance to all sites
        let distanceText='';
        if (siteList[i].distance) {
            distanceText='\n'+loc.strings.siteDistance.replace('%km%', siteList[i].distance)
        }
        const itemText=`${i+1}. [ID ${siteList[i].id}](${siteList[i].URL}). *${siteList[i].name}*\n`+
            `${loc.strings.year}: ${siteList[i].year}\n`+
            `${loc.strings.criteria}: ${siteList[i].criteria.join(', ')}\n`+
            `${loc.strings.country}: ${siteList[i].country.join(', ')}${distanceText}`
        result+=`${itemText}\n\n`
    }

    //add the last row of buttons
    if(row.length){buttons.push(row)}

    //add the notification that user needs to press button to see site details
    result+=`${loc.strings.displayFull}\n\n`

    //new search button must be shown
    const bottomButtonRow = [{text:loc.strings.newSearch, callback_data:'home_screen'}]

    //if there is more than one page of items in the list, we must show navigation buttons
    if(siteList.length>10){
        //and also show the instruction to press them to the user
        const display=loc.strings.display.replace('%start%',start+1).replace('%end%',end).replace('%total%',siteList.length)
        result+=`${display}`

        //if the page is not the first, we show "back" button on the left of the "new search" button
        if(start>0){bottomButtonRow.splice(0,0,{text:'<<',callback_data:'start-'})}

        //if the page is not the last, show "next" button on the right of the "new search" button
        if(siteList.length>end+1){bottomButtonRow.push({text:'>>',callback_data:'start+'})}
    }
    //add final button row to all the buttons with indexes
    buttons.push(bottomButtonRow)

    //send message
    //the message will have links to site descriptions on the whc.unesco.org
    //as there will be more than one link, we do no want a link preview (it can be confusing)
    await message(ctx, result,{reply_markup: { inline_keyboard: buttons },disable_web_page_preview: true})
}

//creates a message with site details
async function showSiteDetails(loc, ctx){
    //get the requested site details
    const {index} = ctx.session.site
    const site = ctx.session.searchResult.siteList[index]

    //show notification if there is no information for this site in the user preferred language
    //note: English info will be shown
    const noInfoText=site.noInfo ? `${loc.strings.noLangInfo}\n\n` : ''

    //if there was a location provided, show distance to  the closest location of this site
    const distanceText=site.distance ? `\n\n${loc.strings.siteDistance.replace('%km%', site.distance)}` :''

    //make a message string
    const result=`${noInfoText}[ID ${site.id}](${site.URL}). *${site.name}*\n`+
        `${site.text}\n\n${loc.strings.year}: ${site.year}\n`+
        `${loc.strings.criteria}: ${site.criteria.join(', ')}\n`+
        `${loc.strings.country}: ${site.country.join(', ')}${distanceText}`

    //if search results have only one item, there's no list, so we need to remove the button
    const count = ctx.session.searchResult.siteList.length
    let kbMap=[]
    if(count===1){kbMap=[[true],[false],[true]]}

    //send message
    //note: here the link preview is enabled and there is only one link
    await commonScreens(loc, ctx,'siteDetails',result,site.locations.length,false,kbMap)
}

//sends a user the list of locations for the particular site
async function showLocationList(loc, ctx){
    //get the requested site details
    const {index, locationStart} = ctx.session.site
    const {locations} = ctx.session.searchResult.siteList[index]

    //if there is more than one location, show the list (same principle as search result list)
    if(locations.length>1){

        //calculate the index of the last item that is shown in this message
        //cannot be more than the total number of items in the list
        const end = Math.min(locationStart+10, locations.length)

        //number of items shown
        //can be less than 10 on the last page
        const total = end - locationStart

        //future message string
        let result=''

        //buttons will have indexes of items that are currently shown
        //on press they will show the location with the particular index
        const buttons=[]

        //buttons are split to 2 rows if there are more than 5 items to show
        let row=[]

        //loop through all locations that must be shown in this message
        for(let i=locationStart;i<end;i++){
            row.push({text:(i+1).toString(), callback_data:`locationDetails_${i}`})
            result += `${i + 1}. ${locations[i].name}\n${locations[i].country}\n` +
                `${loc.strings.coordinates}${locations[i].latitude}, ${locations[i].longitude}\n\n`

            //start the second row for the last half of buttons (but only if there are more than five)
            if(row.length>=total/2 && row.length>=5){
                buttons.push(row)
                row=[]
            }
        }

        //add the last row of buttons
        if(row.length){buttons.push(row)}

        //add the notification that user needs to press button to see the location on the map
        result+=`${loc.strings.displayFull}\n\n`

        //back button must be shown (goes to site details)
        const bottomButtonRow = [{text:loc.strings.back, callback_data:`full_${index}`}]

        //if there is more than one page of locations in the list, we must show navigation buttons
        if(locations.length>10){
            //and also show the instruction to press them to the user
            const display=loc.strings.display.replace('%start%',locationStart+1).replace('%end%',end).replace('%total%',locations.length)
            result+=`${display}`

            //if the page is not the first, we show "back" button on the left of the "new search" button
            if(locationStart>0){bottomButtonRow.splice(0,0,{text:'<<',callback_data:'locationStart-'})}

            //if the page is not the last, show "next" button on the right of the "new search" button
            if(locations.length>end+1){bottomButtonRow.push({text:'>>',callback_data:'locationStart+'})}
        }

        //add navigation button row
        buttons.push(bottomButtonRow)

        //also add last row of buttons: to start new search and to return directly to search results
        const goBackRow=[{text:loc.strings.newSearch, callback_data:'home_screen'}]

        //but button to return to search list is added only if search result contains more than one item
        const count = ctx.session.searchResult.siteList.length
        if(count>1){
            goBackRow.splice(0,0,{text:loc.strings.toList, callback_data:'show_search_results'})
        }

        //combine the last row of buttons
        buttons.push(goBackRow)

        //send message with location list
        await message(ctx, result,{reply_markup: { inline_keyboard: buttons },disable_web_page_preview: false})

    //if there is only one location, no point to show the list: we will show it right away
    } else {
        const {latitude, longitude} = locations[0]

        //send location message (not allowed to add text or buttons to it)
        await ctx.replyWithLocation(latitude, longitude)

        //send message that instructs user what to do next and offers buttons to return to home screen, search results, etc.
        await commonScreens(loc, ctx,'locationShown',loc.strings.oneLocation,ctx.session.site.index,true,[[true,false,true,true]])
    }
}


// --------------------- Helper Functions -------------------//

//function merges arrays based on "and" or "or" criteria
function mixArrays(array1, array2, add = false) {
    //if one array is missing, return another one
    if (!array1.length) { return array2 }
    if(!array2.length){return array1}

    //if arrays must be combined ("and"), merge them and remove duplicates
    if (add) {
        return Array.from( new Set(array1.concat(array2)))

    //"or" search: keep only those items that are included in both arrays
    } else {
        return array1.filter(v => array2.includes(v))
    }
}

//the next three functions calculate distance from the user location to each unesco site
function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

//calculation of distance based on two pair of coordinates
//Haversine formula (great-circle distance)
function distanceKM(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371;

    const dLat = degreesToRadians(lat2-lat1);
    const dLon = degreesToRadians(lon2-lon1);

    lat1 = degreesToRadians(lat1);
    lat2 = degreesToRadians(lat2);

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return earthRadiusKm * c;
}

//function loops through all locations of the site and returns the closest distance
function calcDistance(item, latitude, longitude){
    let d=null;

    //legacy (in case some items do not have array of locations, but have a single one from whc.unesco.org)
    if(item.latitude || item.longitude){
        d=distanceKM(latitude, longitude, item.latitude, item.longitude);
    } else if(item.locations) {
    //loop through all locations and find the closest one
        item.locations.forEach(loc=>{
            const locD = distanceKM(latitude, longitude, loc.latitude, loc.longitude);
            if (d===null || d>locD) {d=locD}
        })
    }
    return d
}

//function combines previous user search with the new message
function appendSearch(prevSearch, newSearch) {
    //if previous string is empty, simply return the new message
    if(prevSearch===''){return newSearch}

    let combinedSearch=''

    //if user wants to extend the search
    if(newSearch.startsWith('+')){
        //simply add the new "or" search to the end of the string
        combinedSearch=prevSearch+newSearch

    //is user wants to narrow the search
    } else {
        //if the string contains several "or" parts, we need to narrow each of them
        if(prevSearch.includes('+')) {
            const parts=prevSearch.split('+')

            //add new search to each part and join them back to one string
            combinedSearch = parts.map(item=>`${item},${newSearch}`).join('+')
        
        //if the search ahs a single part (or several "and" parts), just add one more "and" part to the end
        } else {
            combinedSearch=`${prevSearch},${newSearch}`
        }
    }

    return combinedSearch;
}

//gets the list of countries and the number of sites in each country
async function getCountryList(list) {
    const countries = [];

    //loop through all sites
    list.forEach((item,i) => {
        //some sites are located in more than one country, so get all countries
        item.country.forEach(ctr =>{
            countries.push(ctr)
        })
    })

    //get only unique country names
    const array = Array.from(new Set(countries)).sort()

    //get the count of sites in each country
    //note: some sites are counted more than once here and it is correct
    //because the purpose is to show the number of sites in each country, not the total number of sites
    let string = array.map((item, i) => {
        const count = countries.filter(c=>c===item).length
        return `${i+1}. ${item} (${count})`
    }).join('\n')

    //array is a legacy, but probably will be used in next versions
    return {string, array}
}

//split array by the given delimiter ("," or "+") and remove accidental blanks
//(e.g., is user inputs "something,,other")
function searchToArray(filter, delimiter) {
    let filterArray= filter.split(delimiter).map(item=>item.trim());
    filterArray=filterArray.filter(item => item);
    return filterArray
}

//--------------------- EXPORT -------------------------//
module.exports = bot;