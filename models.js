const mongoose=require('mongoose');

//data about all users who use bot: chat ID and preferred language
const localeSchema=new mongoose.Schema({
    chatID: {
        type: Number,
        required: true,
        unique: true
    },
    locale: {
        type: String,
        default: 'RU'
    },
    //these three items are not currently used
    latitude: {
        type: Number,
    },
    longitude: {
        type: Number,
    },
    locationDate:{
        type: Date
    }
});

//unesco sites data
const unescoSchema = new mongoose.Schema({
    locale: {
        type: String,
        required: true
    },
    criteria: {
        type: [String],
        required: true
    },
    id: {
        type: String,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    name: {
        type: String
    },
    category: {
        type: String,
        required: true
    },
    region: {
        type: String,
        required: true
    },
    country: {
        type: [String],
        required: true
    },
    locations:[{
        name: {
            type:String,
            required: true
        },
        latitude: {
            type: Number,
            required: true
        },
        longitude: {
            type: Number,
            required: true
        },
        country:{
            type:String,
            required: true
        },
    }],
    text: {
        type: String
    },
    URL: {
        type: String,
        required: true
    },
    noInfo: { //indicates if there's no localized data (English data will be displayed)
        type: Boolean
    }
});


mongoose.model('locales', localeSchema);
mongoose.model('unesco', unescoSchema);