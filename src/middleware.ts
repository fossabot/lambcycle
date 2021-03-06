import { Callback, Context } from 'aws-lambda';

import {
    PluginLifeCycleHooks,
    PostHandlerLifeCycleHooks,
    PreHandlerLifeCycleHooks
} from './Constants/PluginLifeCycle';
import executeHandler from './Helpers/executeHandler';
import executePlugins from './Helpers/executePlugins';
import ILambdaHandler from './Interfaces/ILambdaHandler';
import ILifeCyclePlugins from './Interfaces/ILifeCyclePlugins';
import IPluginHookFunction from './Interfaces/IPluginHookFunction';
import IPluginManifest from './Interfaces/IPluginManifest';
import IWrapper from './Interfaces/IWrapper';

const preHandlerHookList = Object['values'](PreHandlerLifeCycleHooks);
const postHandlerHookList = Object['values'](PostHandlerLifeCycleHooks);

const createError = (error: string) => new Error(error);

const middleware = (lambdaHandler: ILambdaHandler) => {
    const plugins: ILifeCyclePlugins = {
        onRequest: [],
        onAuth: [],
        onPreHandler: [],
        onPostHandler: [],
        onPreResponse: [],
        onError: []
    };

    const register = (pluginsManifest: IPluginManifest[]): IWrapper => {
        if (!pluginsManifest || !pluginsManifest.length) {
            throw createError('no plugins have been supplied to the register');
        }

        pluginsManifest.forEach(pluginManifest => {
            Object.keys(pluginManifest.plugin).forEach(key => {
                if (Object['values'](PluginLifeCycleHooks).includes(key)) {
                    const currentPlugin = pluginManifest.plugin[key];
                    const { config: pluginConfig } = pluginManifest;

                    // bind workaround
                    const passConfigToPlugin = (
                        plugin: IPluginHookFunction
                    ) => (config = {}) => (
                        innerWrapper: IWrapper,
                        handleError: Callback
                    ) => plugin(innerWrapper, config, handleError);

                    const lifeCycleMethod = passConfigToPlugin(currentPlugin)(
                        pluginConfig
                    );

                    plugins[key].push(lifeCycleMethod);
                } else {
                    throw createError(
                        `${key} is not a valid hook. see PluginLifeCycleHooks`
                    );
                }
            });
        });

        return wrapper;
    };

    const wrapper = <IWrapper>(
        async function(
            lambdaEvent: object,
            lambdaContext: Context,
            lambdaCallback: Callback
        ): Promise<void> {
            wrapper.event = lambdaEvent;
            wrapper.context = lambdaContext;
            wrapper.error = null;
            wrapper.response = null;

            const errorHandler: Callback = async error => {
                wrapper.error = error;

                await executePlugins(
                    wrapper.plugins.onError,
                    wrapper,
                    lambdaCallback
                );
            };

            for (const index in preHandlerHookList) {
                await executePlugins(
                    wrapper.plugins[preHandlerHookList[index]],
                    wrapper,
                    errorHandler
                );
            }

            await executeHandler(lambdaHandler, wrapper, errorHandler);

            for (const index in postHandlerHookList) {
                await executePlugins(
                    wrapper.plugins[postHandlerHookList[index]],
                    wrapper,
                    errorHandler
                );
            }

            return lambdaCallback(wrapper.error, wrapper.response);
        }
    );

    wrapper.plugins = plugins;
    wrapper.register = register;

    return wrapper;
};

export default middleware;
