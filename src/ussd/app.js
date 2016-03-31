go.app = function() {
    var vumigo = require('vumigo_v02');
    var App = vumigo.App;
    var Choice = vumigo.states.Choice;
    var ChoiceState = vumigo.states.ChoiceState;
    var FreeText = vumigo.states.FreeText;
    var LanguageChoice = vumigo.states.LanguageChoice;
    var PaginatedChoiceState = vumigo.states.PaginatedChoiceState;
    var EndState = vumigo.states.EndState;

    var GoApp = App.extend(function(self) {
        App.call(self, 'states:start');

        self.init = function() {
            // Fetch the contact from the contact store that matches the current
            // user's address. When we get the contact, we put the contact on the
            // app so we can reference it easily when creating each state.
            return self.im
                .contacts.for_user()
                .then(function(user_contact) {
                    self.contact = user_contact;
                });
        };

        self.states.add('states:start', function(name) {
            if(!self.im.user.lang){
                return self.states.create('states:select_language');
            }else{
                return self.states.create('states:main_menu');
            }
        });

        self.states.add('states:main_menu', function(name){
            return new PaginatedChoiceState(name, {
                question: 'Medical Male Circumcision (MMC):',
                characters_per_page: 160,
                options_per_page: null,
                choices: [
                    new Choice('states:end', 'Find a clinic'),
                    new Choice('states:end', 'Speak to an expert for FREE'),
                    new Choice('states:healthsites', 'Get FREE SMSs about your MMC recovery'),
                    new Choice('states:service_rating:location', 'Rate your clinic\'s MMC service'),
                    new Choice('states:brothers_for_life:start', 'Join Brothers for Life'),
                    new Choice('states:select_language', 'Change Language'),
                    new Choice('states:end', 'Exit'),
                ],
                next: function(choice) {
                    return choice.value;
                }
            });
        });

        self.states.add('states:end', function(name) {
            return new EndState(name, {
                text: 'Thanks for using the *120*662# MMC service! Dial back anytime to find MMC clinics, sign up ' +
                'for healing SMSs or find more info about MMC (20c/20sec) Yenzakahle! ',
                next: 'states:start'
            });
        });

        self.states.add('states:select_language', function(name){
            return new LanguageChoice(name, {
                next: function(choice) {
                    self.contact.extra.language_choice = choice.value;
                    return self.im.contacts.save(self.contact)
                        .then(function () {
                            return "states:main_menu";
                        });
                },
                question: "Welcome to MMC Service. Choose your language:",
                choices: [
                    new Choice("en", "English"),
                    new Choice("zu", "isiZulu"),
                    new Choice("st", "Sesotho"),
                    new Choice("ss", "Siswati"),
                    new Choice("nd", "isiNdebele"),
                    new Choice("tn", "Setswana"),
                    new Choice("xh", "isiXhosa"),
                    new Choice("ts", "Xitsonga")
                ]
            });
        });

        self.states.add('states:healthsites', function(name){
            return new ChoiceState(name, {
                question: "Welcome to Healthsites. What type of clinic are you looking for?",
                choices: [
                    new Choice("states:end", "Nearest Clinic"),
                    new Choice("states:end", "MMC Clinic"),
                    new Choice("states:end", "HCT Clinic")
                ],
                next: function(choice) {
                    return choice.value;
                }
            });
        });

        self.states.add('states:service_rating:location', function(name){
            self.im.user.answers = {};
            return new FreeText(name, {
                question: "At which clinic did you get circumcised? Please be specific with the name and " +
                "location. e.g. Peterville Clinic, Rivonia, Johannesburg",
                next: function(text) {
                    return 'states:service_rating:would_recommend';
                }
            });
        });

        self.states.add('states:service_rating:would_recommend', function(name){
            return new ChoiceState(name, {
                question: "Would you recommend a friend to the clinic where you got circumcised?",
                choices: [
                    new Choice("states:service_rating:rating", "Yes"),
                    new Choice("states:service_rating:rating", "No"),
                    new Choice("states:service_rating:end_negative", "I have not been circumcised")
                ],
                next: function(choice) {
                    self.im.user.answers['states:service_rating:would_recommend'] = choice.label;
                    return choice.value;
                }
            });
        });

        self.states.add('states:service_rating:rating', function(name){
            return new ChoiceState(name, {
                question: "How would you rate the attitude of the health care workers at the clinic " +
                "where you got circumcised?",
                choices: [
                    new Choice("states:service_rating:subscribed_to_post_op_sms", "Very Bad"),
                    new Choice("states:service_rating:subscribed_to_post_op_sms", "Bad"),
                    new Choice("states:service_rating:subscribed_to_post_op_sms", "OK"),
                    new Choice("states:service_rating:subscribed_to_post_op_sms", "Good"),
                    new Choice("states:service_rating:subscribed_to_post_op_sms", "Excellent")
                ],
                next: function(choice) {
                    self.im.user.answers['states:service_rating:rating'] = choice.label;
                    return choice.value;
                }
            });
        });

        self.states.add('states:service_rating:subscribed_to_post_op_sms', function(name){
            return new ChoiceState(name, {
                question: "Did you subscribe to the post op SMS service?",
                choices: [
                    new Choice("states:service_rating:end_positive", "Yes I found it helpful"),
                    new Choice("states:service_rating:end_positive", "Yes but it was not helpful"),
                    new Choice("states:service_rating:end_positive", "No I chose not to subscribe"),
                    new Choice("states:service_rating:end_positive", "I didn't know about it")
                ],
                next: function(choice) {
                    self.im.user.answers['states:service_rating:subscribed_to_post_op_sms'] = choice.label;
                    return choice.value;
                }
            });
        });

        self.states.add('states:service_rating:end_positive', function(name){
            return new ChoiceState(name, {
                question: "Thanks for rating your circumcision experience. We appreciate your feedback, it will " +
                "help us improve our MMC service.",
                choices: [
                    new Choice("states:main_menu", "Main Menu"),
                    new Choice("states:end", "Exit")
                ],
                next: function(choice) {
                    return choice.value;
                }
            });
        });

        self.states.add('states:service_rating:end_negative', function(name){
            return new ChoiceState(name, {
                question: "Thank you for your interest. We are only looking for ratings from men who have " +
                "had their circumcision at a clinic recently.",
                choices: [
                    new Choice("states:main_menu", "Main Menu"),
                    new Choice("states:end", "Exit")
                ],
                next: function(choice) {
                    //TODO make web request to store results
                    return choice.value;
                }
            });
        });

        self.states.add('states:brothers_for_life:start', function(name){
            return new ChoiceState(name, {
                question: "Join Brothers for Life and we'll send you free SMSs about ur health, upcoming events & " +
                "services for men. brothersforlife.org T&Cs apply.",
                choices: [
                    new Choice("states:brothers_for_life:join", "Join"),
                    new Choice("states:brothers_for_life:no_join", "No Thanks")
                ],
                next: function(choice) {
                    return choice.value;
                }
            });
        });

        self.states.add('states:brothers_for_life:join', function(name){
            return new ChoiceState(name, {
                question: "Thank you. You will now receive Brothers for Life updates. You can opt out at any point " +
                "by replying STOP to an SMS you receive.",
                choices: [
                    new Choice("states:main_menu", "Main Menu"),
                    new Choice("states:end", "Exit")
                ],
                next: function(choice) {
                    return choice.value;
                }
            });
        });

        self.states.add('states:brothers_for_life:no_join', function(name){
            return new ChoiceState(name, {
                question: "You have selected not to receive Brothers for Life updates. You can join any time in the " +
                "future by dialling *120*662#.",
                choices: [
                    new Choice("states:main_menu", "Main Menu"),
                    new Choice("states:end", "Exit")
                ],
                next: function(choice) {
                    return choice.value;
                }
            });
        });

    });

    return {
        GoApp: GoApp
    };
}();
