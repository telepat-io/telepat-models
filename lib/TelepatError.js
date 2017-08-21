let sprintf = require('sprintf-js').vsprintf;

Error.stackTraceLimit = Infinity;

let TelepatError = function(error, placeholders) {
	Error.captureStackTrace(this, this);
	this.name = Object.keys(error)[0];
	this.code = error.code;

	this.message = placeholders ? sprintf(error.message, [placeholders]) : error.message;
	this.args = placeholders;
	this.status = error.status;
};

TelepatError.prototype = Object.create(Error.prototype);

TelepatError.errors = {
	ServerNotAvailable: {
		code: '001',
		message: 'The API server is unable to fulfil your request. Try again later',
		status: 503
	},
	ServerFailure: {
		code: '002',
		message: 'API internal server error: %s',
		status: 500
	},
	NoRouteAvailable: {
		code: '003',
		message: 'There is no route with this URL path',
		status: 404
	},
	MissingRequiredField: {
		code: '004',
		message: 'Request body is missing a required field: %s',
		status: 400
	},
	RequestBodyEmpty: {
		code: '005',
		message: 'Required request body is empty',
		status: 400,
	},
	InvalidContentType: {
		code: '006',
		message: 'Request content type must be application/json',
		status: 415
	},
	ApiKeySignatureMissing: {
		code: '007',
		message: 'API key is missing from the request headers',
		status: 400
	},
	InvalidApikey: {
		code: '008',
		message: 'API key is not valid for this application',
		status: 401
	},
	DeviceIdMissing: {
		code: '009',
		message: 'Required device ID header is missing',
		status: 400
	},
	ApplicationIdMissing: {
		code: '010',
		message: 'Required application ID header is missing',
		status: 400
	},
	ApplicationNotFound: {
		code: '011',
		message: 'Requested application with ID "%s" does not exist',
		status: 404
	},
	ApplicationForbidden: {
		code: '012',
		message: 'This application does not belong to you',
		status: 401
	},
	AuthorizationMissing: {
		code: '013',
		message: 'Authorization header is not present',
		status: 401
	},
	InvalidAuthorization: {
		code: '014',
		message: 'Invalid authorization: %s',
		status: 401
	},
	OperationNotAllowed: {
		code: '015',
		message: 'You don\'t have the necessary privileges for this operation',
		status: 403
	},
	AdminBadLogin: {
		code: '016',
		message: 'Wrong user email address or password',
		status: 401
	},
	AdminAlreadyAuthorized: {
		code: '017',
		message: 'Admin with that email address is already authorized in this application',
		status: 409
	},
	AdminDeauthorizeLastAdmin: {
		code: '018',
		message: 'Cannot remove yourself from the application because you\'re the only authorized admin',
		status: 409
	},
	AdminNotFoundInApplication: {
		code: '019',
		message: 'Admin with email address %s does not belong to this application',
		status: 404
	},
	ContextNotFound: {
		code: '020',
		message: 'Context not found',
		status: 404
	},
	ContextNotAllowed: {
		code: '021',
		message: 'This context doesn\'t belong to you',
		status: 403
	},
	ApplicationSchemaModelNotFound: {
		code: '022',
		message: 'Application with ID %s does not have a model named %s',
		status: 404
	},
	UserNotFound: {
		code: '023',
		message: 'User not found',
		status: 404
	},
	InvalidApplicationUser: {
		code: '024',
		message: 'User does not belong to this application',
		status: 404
	},
	DeviceNotFound: {
		code: '025',
		message: 'Device with ID %s not found',
		status: 404
	},
	InvalidContext: {
		code: '026',
		message: 'Context with id %s does not belong to app with id %s',
		status: 403
	},
	InvalidChannel: {
		code: '027',
		message: 'Channel is invalid: %s',
		status: 400
	},
	InsufficientFacebookPermissions: {
		code: '028',
		message: 'Insufficient facebook permissions: %s	',
		status: 400
	},
	UserAlreadyExists: {
		code: '029',
		message: 'User already exists',
		status: 409
	},
	AdminAlreadyExists: {
		code: '030',
		message: 'Admin already exists',
		status: 409
	},
	UserBadLogin: {
		code: '031',
		message: 'User email address or password do not match',
		status: 401
	},
	UnspecifiedError: {
		code: '032',
		message: 'Unspecified error',
		status: 500
	},
	AdminNotFound: {
		code: '033',
		message: 'Admin not found',
		status: 404
	},
	ObjectNotFound: {
		code: '034',
		message: 'Object model %s with ID %s not found',
		status: 404
	},
	ParentObjectNotFound: {
		code: '035',
		message: 'Unable to create: parent "%s" with ID "%s" does not exist',
		status: 404
	},
	InvalidObjectRelationKey: {
		code: '036',
		message: 'Unable to create: parent relation key "%s" is not valid. Must be at most %s',
		status: 400
	},
	SubscriptionNotFound: {
		code: '037',
		message: 'Subscription not found',
		status: 404
	},
	InvalidFieldValue: {
		code: '038',
		message: 'Invalid field value: %s',
		status: 400
	},
	ClientBadRequest: {
		code: '039',
		message: 'Generic bad request error: %s',
		status: 400
	},
	MalformedAuthorizationToken: {
		code: '040',
		message: 'Malformed authorization token',
		status: 400
	},
	InvalidAdmin: {
		code: '041',
		message: 'Invalid admin',
		status: 401
	},
	InvalidPatch: {
		code: '042',
		message: 'Invalid patch: %s',
		status: 400
	},
	ApplicationHasNoSchema: {
		code: '043',
		message: 'Could not fulfill request because application has no schema defined',
		status: 501
	},
	InvalidLoginProvider: {
		code: '044',
		message: 'Invalid login provider. Possible choices: %s',
		status: 400
	},
	ServerNotConfigured: {
		code: '045',
		message: 'Unable to fullfill request because the server has not been configured: "%s"',
		status: 501
	},
	ExpiredAuthorizationToken: {
		code: '046',
		message: 'Expired authorization token',
		status: 401
	},
	UnconfirmedAccount: {
		code: '047',
		message: 'This user account has not been confirmed',
		status: 403
	},
	QueryError: {
		code: '048',
		message: 'Failed to parse query filter: %s',
		status: 400
	},
	TilNotFound: {
		code: '049',
		message: 'TelepatIndexedList with name "%s" does not exist',
		status: 404
	},
	DeviceInvalid: {
		code: '050',
		message: 'Device with ID %s is invalid: %s',
		status: 400
	},
	ServerConfigurationFailure: {
		code: '051',
		message: 'Server configuration failure: %s',
		status: 500
	}
};

module.exports = TelepatError;
