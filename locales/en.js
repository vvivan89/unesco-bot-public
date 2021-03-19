module.exports = {
    name: 'EN',
    URL: 'http://whc.unesco.org/en/list/xml/',
    buttonsGPS:{
        back:'New Search',
        send:'Share my location!',

    },
    keyboards:{
        chooseLanguage: {
            EN:'English',
            RU:'Русский',
        },
        chooseMethod: {
            countries: 'Country list',
            location:'Search by location',
            criteria:'Criteria list'
        },
        searchResults:{
            back:'Back',
            list:'Show list',
            single:'Show site',
            km:'km'
        },
        cancelSearch:{
            yes:'Yes, cancel',
            no:'Don\'t cancel'
        },
        siteDetails:{
            locations:'List of site locations',
            list:'<< Back to list',
            home:'New Search'
        },
    },
    strings:{
        sendGPS:'Please press keyboard button to share your location',
        emptySearch:'Empty search',
        noSearchResults:'Your search had no results.\n(Search: "%search%")',
        noSearchResultsLocation:'Your text search and location combination had no results.\n(Search: "%search%")',
        tooNarrowLocation:'No sites in %km% km search radius',
        searchInProgress:'Searching...',
        closeKeyboard:'Cancelling search...',
        foundItems: 'Sites found: %count%',
        request:'Search: "%request%"',
        requestGPS:'Location search in %km% km radius',
        searchResults:'If you want to change your search, send a new message: \nTo nattow the search send additional parameter separated with comma; \nTo broaden the search, start your message with *+*.',
        nearestSite:'Nearest site: %km% км',
        locationRadius:'You can also change the location search radius by pressing the buttons below',
        display:'Sites *%start%-%end%* of *%total%* are shown',
        year:'Year of inscription',
        criteria:'Creteria',
        country:'Countries',
        siteDistance:'Distance to your location: %km% km.',
        displayFull:'To show the site details, press the button with site number.',
        newSearch:'New Search',
        cancelSearch:'Do you want to cancel your search and return to the home screen?',
        noLangInfo:'There\'s no. information about this site in English',
        back:'<< Back',
        toList:'<< To site list',
        toDetails:'<< To site description',
        locationShown:'Location is displayed in the message above.\n\nPlease select the next action.',
        coordinates:'Coordinates: ',
        oneLocation: 'This site has only one location.',
        or:'or',
        and:'and'
    },
    screenTexts:{
        criteria:  `UNESCO identifies 10 selection criteria. Each site can be inscribed to the list under one or more of these:

*Cultural:*

*(i) - to represent a masterpiece of human creative genius;*
*(ii)* - to exhibit an important interchange of human values, over a span of time or within a cultural area of the world, on developments in architecture or technology, monumental arts, town-planning or landscape design;
*(iii) - to bear a unique or at least exceptional testimony to a cultural tradition or to a civilization which is living or which has disappeared;
(iv)* - to be an outstanding example of a type of building, architectural or technological ensemble or landscape which illustrates (a) significant stage(s) in human history;
*(v)* - to be an outstanding example of a traditional human settlement, land-use, or sea-use which is representative of a culture (or cultures), or human interaction with the environment especially when it has become vulnerable under the impact of irreversible change;
*(vi)* - to be directly or tangibly associated with events or living traditions, with ideas, or with beliefs, with artistic and literary works of outstanding universal significance.

*Natural:*

*(vii) - to contain superlative natural phenomena or areas of exceptional natural beauty and aesthetic importance;*
*(viii)* - to be outstanding examples representing major stages of earth's history, including the record of life, significant on-going geological processes in the development of landforms, or significant geomorphic or physiographic features;
*(ix)* - to be outstanding examples representing significant on-going ecological and biological processes in the evolution and development of terrestrial, fresh water, coastal and marine ecosystems and communities of plants and animals;
*(x)* - to contain the most important and significant natural habitats for in-situ conservation of biological diversity, including those containing threatened species of outstanding universal value from the point of view of science or conservation.

_We believe that some criteria are more important for a genuine traveller than the others. These are highlighted in_ *bold*

Choose or type in (as a number) criteria that you are interested in.`,
        greeting: `To search desired UNESCO sites you can:
- input full name of the country or a part of the name,
- input the UNESCO selection criteria,
- send your location to search for sites near you.

To get additional information please use buttons below.

To select another language use /lang
Для выбора другого языка используйте команду /lang`,
        chooseLocale: `Please select Language.
This language will be used to communicate with bot and to describe UNESCO sites.
        
Пожалуйста, выберите язык.
На этом языке будет происходить общение с ботом и он же будет использоваться при описании объектов ЮНЕСКО.`
    },
}