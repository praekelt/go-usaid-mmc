go.app = function() {
    var vumigo = require('vumigo_v02');
    var _ = require('lodash');
    var MetricsHelper = require('go-jsbox-metrics-helper');
    var App = vumigo.App;
    var Choice = vumigo.states.Choice;
    var ChoiceState = vumigo.states.ChoiceState;
    var EndState = vumigo.states.EndState;

    var GoApp = App.extend(function(self) {
        App.call(self, 'states_start');
        var $ = self.$;
        var interrupt = true;

        self.init = function() {

            // Use the metrics helper to add the required metrics
            mh = new MetricsHelper(self.im);
            mh
                // Total unique users
                .add.total_unique_users('sum.unique_users')

                // Total registrations
                .add.total_state_actions(
                    {
                        state: 'states_language',
                        action: 'enter'
                    },
                    'sum.registrations'
                )

                // Total opt outs
                .add.total_state_actions(
                    {
                        state: 'states_unsubscribe',
                        action: 'enter'
                    },
                    'sum.optouts'
                );

            return self.im.contacts
                .for_user()
                .then(function(user_contact) {
                   self.contact = user_contact;
                });
        };


        self.get_clean_first_word = function() {
            return self.im.msg.content
                .split(" ")[0]          // split off first word
                .replace(/\W/g, '')     // remove non letters
                .toUpperCase();         // capitalise
        };


        self.add = function(name, creator) {
            self.states.add(name, function(name, opts) {
                var first_word = self.get_clean_first_word();

                // if first word is not BLOCK or STOP, continue as normal
                // prevent recurring loop with interrupt
                if (!interrupt ||
                    !(first_word === 'BLOCK' || first_word === 'STOP')) {
                    return creator(name, opts);
                }

                interrupt = false;
                opts = opts || {};
                opts.name = name;
                return self.states.create('states_opt_out', opts);
            });
        };


        self.states.add('states_opt_out', function(name) {
            // run opt-out calls
            return go.utils
                .opt_out(self.im, self.contact)
                .then(function() {
                    return go.utils
                        .subscription_unsubscribe_all(self.contact, self.im)
                        .then(function() {
                            return self.states.create('states_unsubscribe');
                        });
                });
        });

        self.states.add('states_unsubscribe', function(name) {
            return new EndState(name, {
                text:
                    $("You have been unsubscribed."),

                next: 'states_start'
            });
        });


        self.add('states_start', function(name) {
            var first_word = self.get_clean_first_word();

            // always subscribe on start or unblock
            if (first_word === "START" || first_word === "UNBLOCK") {
                return self.states.create('states_opt_in');

            // user isn't registered
            } else if (_.isUndefined(self.contact.extra.is_registered) ||
                            self.contact.extra.is_registered === 'false') {
                if (first_word === "MMC") {
                    return self.states.create('states_register_english');
                } else {
                    return self.states.create('states_how_to_register');
                }

            // user is registered
            } else if (self.contact.extra.is_registered === 'true') {
                return go.utils
                    .subscription_completed(self.contact, self.im)
                    .then(function(messages_completed) {
                        if (messages_completed === true) {
                            return self.states.create('states_finished_messages');
                        } else {
                            return self.states.create('states_unfinished_messages');
                        }
                    });
            }
        });

        self.add('states_register_english', function(name) {
            return go.utils
                .subscription_subscribe(self.contact, self.im, 'en')
                .then(function() {
                    return self.states.create('states_language');
                });
        });

        self.add('states_language', function(name) {
            return new ChoiceState(name, {
                question:
                    "You're registered for messages about your circumcision! " +
                    "The wound will heal in 6 weeks. Do not have sex for 6 weeks to " +
                    "prevent infecting or damaging the wound. Avoid smoking, alcohol " +
                    "and drugs. Keep your penis upright for 7 - 10 days, until the " +
                    "swelling goes down. Wear clean underwear every day. Briefs, not " +
                    "boxers. Don't worry if some blood stains the bandage. If blood " +
                    "soaks the bandage, go to the clinic immediately. " +
                    "If you'd like messages in another language, reply with the " +
                    "number of your language",

                choices: [
                    new Choice('xh', $("Xhosa")),
                    new Choice('zu', $("Zulu")),
                    new Choice('st', $("Sotho")),
                    new Choice('af', $("Afrikaans")),
                ],

                next: function(choice) {
                    self.contact.extra.language_choice = choice.value;

                    return self.im.user
                        .set_lang(choice.value)
                        .then(function() {
                            return self.im.contacts.save(self.contact);
                        })
                        .then(function() {
                            return 'states_update_language';
                        });
                },

                events: {
                    'state:enter': function() {
                        self.contact.extra.is_registered = 'true';

                        return self.im.user
                            .set_lang('en')
                            .then(function() {
                                return self.im.contacts.save(self.contact);
                            });
                    }
                }
            });
        });

        self.add('states_update_language', function(name) {
            // update subscription to language of choice
            return go.utils
                .subscription_set_language(self.contact, self.im, self.contact.extra.language_choice)
                .then(function() {
                     return self.states.create('states_update_language_success');
                });
        });

        self.add('states_update_language_success', function(name) {
            return new EndState(name, {
                text:
                    $("The wound will heal in 6 weeks. Do not have sex for 6 weeks to " +
                      "prevent infecting or damaging the wound. Avoid smoking, alcohol " +
                      "and drugs.  Keep your penis upright for 7 - 10 days, until the " +
                      "swelling goes down. Wear clean underwear every day. Briefs, not " +
                      "boxers. Don't worry if some blood stains the bandage. If blood " +
                      "soaks the bandage, go to the clinic immediately."),

                next: 'states_start'
            });
        });

        self.add('states_how_to_register', function(name) {
            return new EndState(name, {
                text:
                    $("Welcome to the Medical Male Circumcision (MMC) info service. To get " +
                    "FREE info on how to look after your circumcision wound please SMS 'MMC' " +
                    "to {{SMS_number}}."
                    ).context({
                        SMS_number: self.im.config.channel
                    }),

                next: 'states_start'
            });
        });

        self.add('states_finished_messages', function(name) {
            return new EndState(name, {
                text:
                    $("You have finished your set of SMSs and your circumcision wound should " +
                    "be healed. If not, please visit your local clinic. Thanks for using " +
                    "the MMC info service."),

                next: 'states_start'
            });
        });

        self.add('states_unfinished_messages', function(name) {
            return new EndState(name, {
                text:
                    $("MMC info: U r registered to receive SMSs about ur circumcision. " +
                    "To opt out SMS 'STOP' to {{SMS_number}}. If u have concerns with ur " +
                    "wound please visit ur local clinic."
                    ).context({
                        SMS_number: self.im.config.channel
                    }),

                next: 'states_start'
            });
        });

        self.add('states_opt_in', function(name) {
            // run opt-in calls
            return go.utils
                .opt_in(self.im, self.contact)
                .then(function() {
                    return self.states.create('states_optedin');
                });
        });

        self.add('states_optedin', function(name) {
            return new EndState(name, {
                text:
                    $("You are now able to resubscribe. " +
                      "Please SMS 'MMC' to {{SMS_number}} to continue").context({
                        SMS_number: self.im.config.channel
                    }),

                next: 'states_start'
            });
        });

    });

    return {
        GoApp: GoApp
    };
}();
