import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as whatsAlf from './whats-alf'
import * as memetics from './memetics'

type AlgoHandler = (
  ctx: AppContext,
  params: QueryParams,
  requesterDid?: string,
) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [whatsAlf.shortname]: whatsAlf.handler,
  [memetics.shortname]: memetics.handler,
}

export default algos
