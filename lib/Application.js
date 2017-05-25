const BaseModel = require('./BaseModel');

/**
 * @typedef {{
 * 		relationType: string,
 *		parentModel: string
 * }} Relation
 */

/**
 * @typedef {{
 * 		meta_read_acl: Number,
 * 		read_acl: Number,
 *		write_acl: Number,
 *		properties: Object,
 *		belongsTo: Relation[],
 *		hasSome: string[],
 *		hasMany: string[],
 *		hasSome_property: string,
 *		ios_push_field: string,
 *		author_fields: string[]
 * }} Model
 */

/**
 * @typedef {{
 * 		name: string,
 * 		keys: string[],
 * 		admins: string[],
 * 		type: "application",
 * 		email_confirmation: Boolean,
 * 		from_email: string,
 * 		password_reset: Object,
 *		password_reset.android_app_link: string,
 *		password_reset.app_link: string,
 *		password_reset.web_link: string,
 *		schema: Object.<string, Model>,
 *		apn_key: string,
 *		apn_key_id: string,
 *		apn_team_id: string,
 *		apn_topic: string,
 *		gcm_api_key: string,
 *		email_templates: {weblink: string, confirm_account: string, after_confirm: string, reset_password: string}
 * }} TelepatApplication
 */
class TelepatApplication extends BaseModel {
    /**
	 *
	 * @param {TelepatApplication} props
	 */
	constructor(props) {
        props.admins = Array.isArray(props.admins) ? props.admins : [];
        props.keys = Array.isArray(props.keys) ? props.keys : [];
		props.type = 'application';

        const proxiedParent = super(props);

        super.immutableProperties = Object.assign(super.immutableProperties, {
            keys: true,
            admins: true
        });

        return proxiedParent;
    }

    doStuff() {
        console.log(this.immutableProperties);
    }

    isAPNConfigured() {
        return !!(this.apn_key && this.apn_team_id);
    }
}

/**
 *  @property {TelepatApplication[]} apps All the apps
 */
TelepatApplication.apps = [];

module.exports = TelepatApplication;
