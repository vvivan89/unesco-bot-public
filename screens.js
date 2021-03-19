//this block creates two rows of buttons with criteria numbers
//allows user to start text search by criteria from the descripption screen
const criteriaArray = [['(i)', '(ii)', '(iii)', '(iv)', '(v)'], ['(vi)', '(vii)', '(viii)', '(ix)', '(x)']]
const criteriaListKB = criteriaArray.map(row => {
    return row.map(item => {
        return {
            text: item,
            callback_data:`criteria_${item}`
        }
    })
})

//common screens used by bot
//eases the communication with user by predefined keyboard buttons
function screens(locale, name, upperText="", lowerText="") {
    const screenList = {
        //starting screen (also shown when search is over)
        greeting: {
            text: `${upperText}\n\n${locale.screenTexts.greeting}`,
            kb:[
                [{
                    text: locale.keyboards.chooseMethod.countries,
                    callback_data:'info_country'
                },
                {
                    text:locale.keyboards.chooseMethod.criteria,
                    callback_data:'info_criteria'
                }],
                [{
                    text:locale.keyboards.chooseMethod.location,
                    request_location: true,
                    callback_data:'search_gps'
                }]
            ]
        },
        //language selection screen
        //if other locales are added, this screen needs to be extended
        language: {
            text: locale.screenTexts.chooseLocale,
            kb:[
                [{
                    text: locale.keyboards.chooseLanguage.RU,
                    callback_data:'RU'
                },
                {
                    text:locale.keyboards.chooseLanguage.EN,
                    callback_data:'EN'
                }]
            ]
        },
        //result of the search and user is offered to show the list of all found sites
        //here "lowerText" actually indicates if the search result has single item
        //and button caption is adjusted accordingly
        searchResult:{
            text: `${upperText}\n\n${locale.strings.searchResults}`,
            kb:[
                [{
                    text: lowerText ? locale.keyboards.searchResults.single : locale.keyboards.searchResults.list,
                    callback_data:'show_search_results'
                }],
                [{
                    text:locale.keyboards.searchResults.back,
                    callback_data:'home_screen'
                }]
            ]
        },

        //alternate search result screen
        //when user provides location, distance is calculated as the minimum value that includes at least 3 sites
        //users are offered to extend or shring the search distance manually
        //in 50 and 100km increments
        searchResultGPS:{
            text: `${upperText}\n\n${locale.strings.searchResults}\n\n${locale.strings.locationRadius}`,
            kb:[
                [{
                    text: lowerText ? locale.keyboards.searchResults.single : locale.keyboards.searchResults.list,
                    callback_data:'show_search_results'
                },
                {
                    text:locale.keyboards.searchResults.back,
                    callback_data:'home_screen'
                }],
                [
                    {
                        text: `-100 ${locale.keyboards.searchResults.km}`,
                        callback_data:'dist_-100'
                    },
                    {
                        text: `-50 ${locale.keyboards.searchResults.km}`,
                        callback_data:'dist_-50'
                    },
                    {
                        text: `+50 ${locale.keyboards.searchResults.km}`,
                        callback_data:'dist_+50'
                    },
                    {
                        text: `+100 ${locale.keyboards.searchResults.km}`,
                        callback_data:'dist_+100'
                    }
                ]
            ]
        },

        //if user sends text in the wrong moment bot will not do anything with it
        //but will ask user if they want to cancel current operation and start a new search
        cancelSearch:{
            text: locale.strings.cancelSearch,
            kb:[
                [{
                    text: locale.keyboards.cancelSearch.yes,
                    callback_data:'home_screen'
                },
                {
                    text:locale.keyboards.cancelSearch.no,
                    callback_data:'no_cancel_search'
                }]
            ]
        },

        //details of the selected unesco sites
        //buttons offer to reveal site location(s) or return back
        //also shows number of locations that site has
        siteDetails:{
            text: upperText,
            kb:[
                [{
                    text: `${locale.keyboards.siteDetails.locations} (${lowerText})`, //number of site locations
                    callback_data:'show_location_list'
                }],
                [{
                    text: locale.keyboards.siteDetails.list,
                    callback_data:'show_search_results'
                }],
                [{
                    text: locale.keyboards.siteDetails.home,
                    callback_data:'home_screen'
                }],
            ]
        },

        //shows one particular location that site has
        //buttons offer to return to search results or to the details of the current site
        locationShown:{
            text: `${upperText}\n\n${locale.strings.locationShown}`,
            kb:[
                [{
                    text:locale.strings.toDetails, 
                    callback_data:`full_${lowerText}` //index will be used to return to current site details
                },
                {
                    text:locale.keyboards.siteDetails.locations, 
                    callback_data:'show_location_list'
                }],
                [{
                    text:locale.strings.toList, 
                    callback_data:'show_search_results'
                },
                {
                    text:locale.strings.newSearch, 
                    callback_data:'home_screen'
                }]
            ]
        },
        //informationla screen with list of countries
        //does not do anything useful
        countryList: {
            text: upperText,
            kb:[[{text: locale.strings.newSearch, callback_data:'home_screen'}]]
        },
        //informational screen with description of criteria
        //allows to start text search by pressing a button with criteria
        criteriaList: {
            text: locale.screenTexts.criteria,
            kb: [
                ...criteriaListKB,
                /*
                    this button allows to search all "tourictic" criteria at once
                    (i) - most beautiful buildings
                    (iii) - unique buildings
                    (vii) - most beautiful nature sites
                */
                [{
                    text: `(i)${locale.strings.or}(iii)${locale.strings.or}(vii)`,
                    callback_data:'criteria_(i)+(iii)+(vii)'
                },
                {
                    text:locale.strings.newSearch, 
                    callback_data:'home_screen'
                }]
            ]
        }
    }

    return screenList[name]
}

//prepare variable for export
//criteriaArray is also used in the main, bit in needs to be a one-dimensional array
const exp = {
    screens,
    criteriaArray: criteriaArray.flat()
}

module.exports = exp