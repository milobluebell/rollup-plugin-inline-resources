
import chalk from 'chalk';
import path, { resolve } from 'path';
import { NormalizedOutputOptions, OutputBundle, OutputChunk, OutputAsset, EmittedAsset } from 'rollup';
import { chalkSay, getDomNodeStringFromSourceProp, extractExpectedTagName, createEmbededDomNode, extractProperties } from './utils';
export interface IPluginProps {
  //
  includes?: string[] | RegExp;
  // it will terser bundle content
  // TODO: unsupportted yet
  // compress?: boolean;
  // ignorations
  // such as ['async', 'defer', { key: 'type', value: 'module' }, { key: 'rel', value: 'modulepreload' }, { key: 'href', value: '//at.alicdn.com/t/font_2857489_imieufzfwmb.css'}]
  excludeAttrs?: Array<{ key: string, value: string } | string>;
  excludes?: RegExp;
  // public path
  base?: URL['href'];
  // if unmet any resource, which level of notification should this launch
  // 2 means 'error'；1 equals 'warn'；0 equals 'none'
  nonMatched?: 2 | 1 | 0 | 'error' | 'warn' | 'none';
  // should it cache remote curl content?
  cache?: boolean;
  // if this plugin will transform resources' code according to base option
  // such as, Before: `import * from './vendor.xxx'`; After: `import * from '${base}/vendor.xxx'`
  bundleTransform?: (bundleName: string, bundleCode: string | undefined) => string;

}

export const DEFAULT_CONFIGS = {
  includes: /\.(js|css)$/,
  compress: true,
  excludeAttrs: ['async', 'defer', { key: 'type', value: 'module' }, { key: 'rel', value: 'modulepreload' }],
  exclude: /\.(svg|jpg)$/,
  download: true,
  nonMatched: 2,
  cache: true,
  base: '',
  bundleTransform: () => void 0
}
export default function inlineResource(configs?: IPluginProps) {
  const {
    includes: configIncludes = DEFAULT_CONFIGS.includes,
    // compress = DEFAULT_CONFIGS.compress,
    excludeAttrs = DEFAULT_CONFIGS.excludeAttrs,
    excludes: configExcludes = DEFAULT_CONFIGS.exclude,
    nonMatched = DEFAULT_CONFIGS.nonMatched,
    cache = DEFAULT_CONFIGS.cache,
    base = DEFAULT_CONFIGS.base,
    bundleTransform = DEFAULT_CONFIGS.bundleTransform
  } = configs || {};

  return {
    name: 'rollup-plugin-inline-resource',
    generateBundle(output: NormalizedOutputOptions, bundles: OutputBundle) {

      // valid checkings
      let configIncludeFuzzyType = Object.prototype.toString.call(configIncludes).toLowerCase();
      if (!configIncludeFuzzyType.includes(' array') && !configIncludeFuzzyType.includes(' regexp')) {
        const includeTypeErrorMsg = `rollup-plugin-inline-resource\'s input option \'includes\' should be an array or RegExp`;
        chalkSay(includeTypeErrorMsg);
        throw new Error(includeTypeErrorMsg);
      }

      // includes/exclude option worked here
      const bundleNames = Object.keys(bundles);
      const includeValidationCompare = ((rule) => {
        if (configIncludeFuzzyType.includes(' array')) {
          return function (bundleName: string) {
            return (rule as string[]).includes(path.extname(bundleName).substring(1));
          }
        }
        if (configIncludeFuzzyType.includes(' regexp')) {
          return function (bundleName: string) {
            return (rule as RegExp).test(bundleName)
          }
        }
        return () => false
      })(configIncludes);

      // bundles filterd after includes/exclude
      const conditionalBundleNames = bundleNames.filter((bundleName: string) => {
        let includeCondition = includeValidationCompare(bundleName);
        let excludeCondition = configExcludes.test(bundleName);
        return includeCondition && !excludeCondition && path.extname(bundleName) !== '.html';
      });

      //
      const extractSourceCode = (bundleName: string, bundleWholeInfo: Record<any, any>) => {
        const bundleExtName = path.extname(bundleName);
        if (bundleExtName === '.js') {
          return bundleWholeInfo?.code || ' '
        }
        if (bundleWholeInfo?.type === 'asset' || ['.css', '.html', '.svg', '.jpg', '.png'].includes(bundleExtName)) {
          return bundleWholeInfo?.['source'] || ' '
        }
      }

      // save origin html content
      const htmlFileName = bundleNames.filter(name => path.extname(name) === '.html')[0]
      const htmlBundleInfo = bundles[htmlFileName];
      // @ts-ignore
      let { source: htmlFileContent } = htmlBundleInfo;

      console.log(htmlFileContent, 'htmlFileContent1');

      chalkSay(`\n[rollup-plugin-inline-sources] Resources included: ${conditionalBundleNames.join('、')}...`, chalk.green, false);

      conditionalBundleNames.forEach((name) => {
        const currentBundleContent = extractSourceCode(`${name}`, bundles[name]);
        const mettedDomNodeString = getDomNodeStringFromSourceProp(`${base}${name}`, htmlFileContent);
        if (!mettedDomNodeString) {
          const unmetErrorMsg = `Rollup-plugin-inline-resource haven't matched the file named ${base}${name}`;
          if (nonMatched === 2 || nonMatched === 'error') {
            chalkSay(unmetErrorMsg, chalk.bgRed.white);
            throw new Error(unmetErrorMsg);
          }
          if (nonMatched === 1 || nonMatched === 'warn') {
            chalkSay(unmetErrorMsg, chalk.bgYellow.white);
          }
        }
        // TODO: not support uncompressed one now
        const innerHTMLContent = currentBundleContent;

        // excludeAttrs worked here
        const props = extractProperties(mettedDomNodeString);
        let domNodeString = mettedDomNodeString;
        if (!excludeAttrs.filter(extAttr => {
          if (typeof extAttr === 'string') {
            return new RegExp(`${extAttr}`, 'g').test(props[0]);
          } else {
            return new RegExp(`${extAttr.key}\=\"${extAttr.value}\"`, 'g').test(props[0]);
          }
        }).length) {
          console.log(`length not correct`, 1);
          domNodeString = createEmbededDomNode(extractExpectedTagName(mettedDomNodeString), bundleTransform ? bundleTransform(name, innerHTMLContent) : innerHTMLContent, props, {
            name,
            base,
            mettedDomNodeString,
            bundleNames: conditionalBundleNames,
          });
        }

        console.log(htmlFileContent, 1);
        console.log(mettedDomNodeString, 2);
        console.log(domNodeString, 3);

        // replacements
        htmlFileContent = htmlFileContent.replace(mettedDomNodeString, domNodeString);
        console.log(htmlFileContent, 4);
      });

      this.emitFile({
        type: 'asset',
        source: htmlFileContent,
        name: '',
        fileName: htmlFileName
      });

    }
  }
}
