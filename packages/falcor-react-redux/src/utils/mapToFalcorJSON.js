import f_meta from './falcorMetadataKey';
import { FalcorJSON } from '@graphistry/falcor';

export default function mapToFalcorJSON(data, falcor) {
    let dataProto;
    if (!data || typeof data !== 'object') {
        dataProto = new FalcorJSON();
        data = Object.create(dataProto);
    } else if (!(data instanceof FalcorJSON)) {
        dataProto = new FalcorJSON(data[f_meta]);
        delete data[f_meta];
        data.__proto__ = dataProto;
    }
    if (falcor && falcor._recycleJSON) {
        falcor._seed = { json: data };
    }
    return data;
}
