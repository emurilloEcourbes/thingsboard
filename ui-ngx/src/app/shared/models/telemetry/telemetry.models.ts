///
/// Copyright © 2016-2023 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///


import { EntityType } from '@shared/models/entity-type.models';
import { AggregationType } from '../time/time.models';
import { Observable, ReplaySubject } from 'rxjs';
import { EntityId } from '@shared/models/id/entity-id';
import { map } from 'rxjs/operators';
import { NgZone } from '@angular/core';
import {
  AlarmCountQuery,
  AlarmData,
  AlarmDataQuery,
  EntityCountQuery,
  EntityData,
  EntityDataQuery,
  EntityFilter,
  EntityKey,
  TsValue
} from '@shared/models/query/query.models';
import { PageData } from '@shared/models/page/page-data';
import { alarmFields } from '@shared/models/alarm.models';
import { entityFields } from '@shared/models/entity.models';
import { isUndefined } from '@core/utils';
import { CmdWrapper, WsSubscriber } from '@shared/models/websocket/websocket.models';
import { TelemetryWebsocketService } from '@core/ws/telemetry-websocket.service';
import { NotificationCountUpdateMsg, NotificationsUpdateMsg } from '@shared/models/websocket/notification-ws.models';
import { Notification } from '@shared/models/notification.models';

export const NOT_SUPPORTED = 'Not supported!';

export enum DataKeyType {
  timeseries = 'timeseries',
  attribute = 'attribute',
  function = 'function',
  alarm = 'alarm',
  entityField = 'entityField',
  count = 'count'
}

export enum LatestTelemetry {
  LATEST_TELEMETRY = 'LATEST_TELEMETRY'
}

export enum AttributeScope {
  CLIENT_SCOPE = 'CLIENT_SCOPE',
  SERVER_SCOPE = 'SERVER_SCOPE',
  SHARED_SCOPE = 'SHARED_SCOPE'
}

export enum TimeseriesDeleteStrategy {
  DELETE_ALL_DATA = 'DELETE_ALL_DATA',
  DELETE_ALL_DATA_EXCEPT_LATEST_VALUE = 'DELETE_ALL_DATA_EXCEPT_LATEST_VALUE',
  DELETE_LATEST_VALUE = 'DELETE_LATEST_VALUE',
  DELETE_ALL_DATA_FOR_TIME_PERIOD = 'DELETE_ALL_DATA_FOR_TIME_PERIOD'
}

export type TelemetryType = LatestTelemetry | AttributeScope;

export const toTelemetryType = (val: string): TelemetryType => {
  if (LatestTelemetry[val]) {
    return LatestTelemetry[val];
  } else {
    return AttributeScope[val];
  }
};

export const telemetryTypeTranslations = new Map<TelemetryType, string>(
  [
    [LatestTelemetry.LATEST_TELEMETRY, 'attribute.scope-telemetry'],
    [AttributeScope.CLIENT_SCOPE, 'attribute.scope-client'],
    [AttributeScope.SERVER_SCOPE, 'attribute.scope-server'],
    [AttributeScope.SHARED_SCOPE, 'attribute.scope-shared']
  ]
);

export const isClientSideTelemetryType = new Map<TelemetryType, boolean>(
  [
    [LatestTelemetry.LATEST_TELEMETRY, true],
    [AttributeScope.CLIENT_SCOPE, true],
    [AttributeScope.SERVER_SCOPE, false],
    [AttributeScope.SHARED_SCOPE, false]
  ]
);

export const timeseriesDeleteStrategyTranslations = new Map<TimeseriesDeleteStrategy, string>(
  [
    [TimeseriesDeleteStrategy.DELETE_ALL_DATA, 'attribute.delete-timeseries.all-data'],
    [TimeseriesDeleteStrategy.DELETE_ALL_DATA_EXCEPT_LATEST_VALUE, 'attribute.delete-timeseries.all-data-except-latest-value'],
    [TimeseriesDeleteStrategy.DELETE_LATEST_VALUE, 'attribute.delete-timeseries.latest-value'],
    [TimeseriesDeleteStrategy.DELETE_ALL_DATA_FOR_TIME_PERIOD, 'attribute.delete-timeseries.all-data-for-time-period']
  ]
);

export interface AttributeData {
  lastUpdateTs?: number;
  key: string;
  value: any;
}

export interface TimeseriesData {
  [key: string]: Array<TsValue>;
}

export enum DataSortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export enum WsCmdType {
  AUTH = 'AUTH',

  ATTRIBUTES = 'ATTRIBUTES',
  TIMESERIES = 'TIMESERIES',
  TIMESERIES_HISTORY = 'TIMESERIES_HISTORY',
  ENTITY_DATA = 'ENTITY_DATA',
  ENTITY_COUNT = 'ENTITY_COUNT',
  ALARM_DATA = 'ALARM_DATA',
  ALARM_COUNT = 'ALARM_COUNT',

  NOTIFICATIONS = 'NOTIFICATIONS',
  NOTIFICATIONS_COUNT = 'NOTIFICATIONS_COUNT',
  MARK_NOTIFICATIONS_AS_READ = 'MARK_NOTIFICATIONS_AS_READ',
  MARK_ALL_NOTIFICATIONS_AS_READ = 'MARK_ALL_NOTIFICATIONS_AS_READ',

  ALARM_DATA_UNSUBSCRIBE = 'ALARM_DATA_UNSUBSCRIBE',
  ALARM_COUNT_UNSUBSCRIBE = 'ALARM_COUNT_UNSUBSCRIBE',
  ENTITY_DATA_UNSUBSCRIBE = 'ENTITY_DATA_UNSUBSCRIBE',
  ENTITY_COUNT_UNSUBSCRIBE = 'ENTITY_COUNT_UNSUBSCRIBE',
  NOTIFICATIONS_UNSUBSCRIBE = 'NOTIFICATIONS_UNSUBSCRIBE'
}

export interface WebsocketCmd {
  cmdId: number;
  type: WsCmdType;
}

export interface AuthWsCmd {
  authCmd: AuthCmd;
}

export interface TelemetryPluginCmd extends WebsocketCmd {
  keys: string;
}

export abstract class SubscriptionCmd implements TelemetryPluginCmd {
  cmdId: number;
  keys: string;
  entityType: EntityType;
  entityId: string;
  scope?: AttributeScope;
  unsubscribe: boolean;
  abstract type: WsCmdType;
}

export class AttributesSubscriptionCmd extends SubscriptionCmd {
  type = WsCmdType.ATTRIBUTES;
}

export class TimeseriesSubscriptionCmd extends SubscriptionCmd {
  startTs: number;
  timeWindow: number;
  interval: number;
  limit: number;
  agg: AggregationType;
  type = WsCmdType.TIMESERIES;
}

export class GetHistoryCmd implements TelemetryPluginCmd {
  cmdId: number;
  keys: string;
  entityType: EntityType;
  entityId: string;
  startTs: number;
  endTs: number;
  interval: number;
  limit: number;
  agg: AggregationType;
  type = WsCmdType.TIMESERIES_HISTORY;
}

export interface EntityHistoryCmd {
  keys: Array<string>;
  startTs: number;
  endTs: number;
  interval: number;
  limit: number;
  agg: AggregationType;
  fetchLatestPreviousPoint?: boolean;
}

export interface LatestValueCmd {
  keys: Array<EntityKey>;
}

export interface TimeSeriesCmd {
  keys: Array<string>;
  startTs: number;
  timeWindow: number;
  interval: number;
  limit: number;
  agg: AggregationType;
  fetchLatestPreviousPoint?: boolean;
}

export interface AggKey {
  id: number;
  key: string;
  agg: AggregationType;
  previousStartTs?: number;
  previousEndTs?: number;
  previousValueOnly?: boolean;
}

export interface AggEntityHistoryCmd {
  keys: Array<AggKey>;
  startTs: number;
  endTs: number;
}

export interface AggTimeSeriesCmd {
  keys: Array<AggKey>;
  startTs: number;
  timeWindow: number;
}

export class EntityDataCmd implements WebsocketCmd {
  cmdId: number;
  query?: EntityDataQuery;
  historyCmd?: EntityHistoryCmd;
  latestCmd?: LatestValueCmd;
  tsCmd?: TimeSeriesCmd;
  aggHistoryCmd?: AggEntityHistoryCmd;
  aggTsCmd?: AggTimeSeriesCmd;
  type = WsCmdType.ENTITY_DATA;

  public isEmpty(): boolean {
    return !this.query && !this.historyCmd && !this.latestCmd && !this.tsCmd && !this.aggTsCmd && !this.aggHistoryCmd;
  }
}

export class EntityCountCmd implements WebsocketCmd {
  cmdId: number;
  query?: EntityCountQuery;
  type = WsCmdType.ENTITY_COUNT;
}

export class AlarmDataCmd implements WebsocketCmd {
  cmdId: number;
  query?: AlarmDataQuery;
  type = WsCmdType.ALARM_DATA;

  public isEmpty(): boolean {
    return !this.query;
  }
}

export class AlarmCountCmd implements WebsocketCmd {
  cmdId: number;
  query?: AlarmCountQuery;
  type = WsCmdType.ALARM_COUNT;
}

export class EntityDataUnsubscribeCmd implements WebsocketCmd {
  cmdId: number;
  type = WsCmdType.ENTITY_DATA_UNSUBSCRIBE;
}

export class EntityCountUnsubscribeCmd implements WebsocketCmd {
  cmdId: number;
  type = WsCmdType.ENTITY_COUNT_UNSUBSCRIBE;
}

export class AlarmDataUnsubscribeCmd implements WebsocketCmd {
  cmdId: number;
  type = WsCmdType.ALARM_DATA_UNSUBSCRIBE;
}

export class AlarmCountUnsubscribeCmd implements WebsocketCmd {
  cmdId: number;
  type = WsCmdType.ALARM_COUNT_UNSUBSCRIBE;
}

export class AuthCmd implements WebsocketCmd {
  cmdId = 0;
  type: WsCmdType.AUTH;
  token: string;

  constructor(token: string) {
    this.token = token;
  }
}

export class TelemetryPluginCmdsWrapper implements CmdWrapper {

  constructor() {
    this.cmds = [];
  }

  cmds: Array<WebsocketCmd>;

  private static popCmds<T>(cmds: Array<T>, leftCount: number): Array<T> {
    const toPublish = Math.min(cmds.length, leftCount);
    if (toPublish > 0) {
      return cmds.splice(0, toPublish);
    } else {
      return [];
    }
  }

  public hasCommands(): boolean {
    return this.cmds.length > 0;
  }

  public clear() {
    this.cmds.length = 0;
  }

  public preparePublishCommands(maxCommands: number): TelemetryPluginCmdsWrapper {
    const preparedWrapper = new TelemetryPluginCmdsWrapper();
    preparedWrapper.cmds = TelemetryPluginCmdsWrapper.popCmds(this.cmds, maxCommands);
    return preparedWrapper;
  }
}

export interface SubscriptionData {
  [key: string]: [number, any, number?][];
}

export interface IndexedSubscriptionData {
  [id: number]: [number, any, number?][];
}

export interface SubscriptionDataHolder {
  data: SubscriptionData;
}

export interface SubscriptionUpdateMsg extends SubscriptionDataHolder {
  subscriptionId: number;
  errorCode: number;
  errorMsg: string;
}

export enum CmdUpdateType {
  ENTITY_DATA = 'ENTITY_DATA',
  ALARM_DATA = 'ALARM_DATA',
  ALARM_COUNT_DATA = 'ALARM_COUNT_DATA',
  COUNT_DATA = 'COUNT_DATA',
  NOTIFICATIONS_COUNT = 'NOTIFICATIONS_COUNT',
  NOTIFICATIONS = 'NOTIFICATIONS'
}

export interface CmdUpdateMsg {
  cmdId: number;
  errorCode: number;
  errorMsg: string;
  cmdUpdateType: CmdUpdateType;
}

export interface DataUpdateMsg<T> extends CmdUpdateMsg {
  data?: PageData<T>;
  update?: Array<T>;
}

export interface EntityDataUpdateMsg extends DataUpdateMsg<EntityData> {
  cmdUpdateType: CmdUpdateType.ENTITY_DATA;
}

export interface AlarmDataUpdateMsg extends DataUpdateMsg<AlarmData> {
  cmdUpdateType: CmdUpdateType.ALARM_DATA;
  allowedEntities: number;
  totalEntities: number;
}

export interface EntityCountUpdateMsg extends CmdUpdateMsg {
  cmdUpdateType: CmdUpdateType.COUNT_DATA;
  count: number;
}

export interface AlarmCountUpdateMsg extends CmdUpdateMsg {
  cmdUpdateType: CmdUpdateType.ALARM_COUNT_DATA;
  count: number;
}

export type WebsocketDataMsg = AlarmDataUpdateMsg | AlarmCountUpdateMsg |
  EntityDataUpdateMsg | EntityCountUpdateMsg | SubscriptionUpdateMsg | NotificationCountUpdateMsg | NotificationsUpdateMsg;

export const isEntityDataUpdateMsg = (message: WebsocketDataMsg): message is EntityDataUpdateMsg => {
  const updateMsg = (message as CmdUpdateMsg);
  return updateMsg.cmdId !== undefined && updateMsg.cmdUpdateType === CmdUpdateType.ENTITY_DATA;
};

export const isAlarmDataUpdateMsg = (message: WebsocketDataMsg): message is AlarmDataUpdateMsg => {
  const updateMsg = (message as CmdUpdateMsg);
  return updateMsg.cmdId !== undefined && updateMsg.cmdUpdateType === CmdUpdateType.ALARM_DATA;
};

export const isEntityCountUpdateMsg = (message: WebsocketDataMsg): message is EntityCountUpdateMsg => {
  const updateMsg = (message as CmdUpdateMsg);
  return updateMsg.cmdId !== undefined && updateMsg.cmdUpdateType === CmdUpdateType.COUNT_DATA;
};

export const isAlarmCountUpdateMsg = (message: WebsocketDataMsg): message is AlarmCountUpdateMsg => {
  const updateMsg = (message as CmdUpdateMsg);
  return updateMsg.cmdId !== undefined && updateMsg.cmdUpdateType === CmdUpdateType.ALARM_COUNT_DATA;
};

export class SubscriptionUpdate implements SubscriptionUpdateMsg {
  subscriptionId: number;
  errorCode: number;
  errorMsg: string;
  data: SubscriptionData;

  constructor(msg: SubscriptionUpdateMsg) {
    this.subscriptionId = msg.subscriptionId;
    this.errorCode = msg.errorCode;
    this.errorMsg = msg.errorMsg;
    this.data = msg.data;
  }

  public prepareData(keys: string[]) {
    if (!this.data) {
      this.data = {};
    }
    if (keys) {
      keys.forEach((key) => {
        if (!this.data[key]) {
          this.data[key] = [];
        }
      });
    }
  }

  public updateAttributeData(origData: Array<AttributeData>): Array<AttributeData> {
    for (const key of Object.keys(this.data)) {
      const keyData = this.data[key];
      if (keyData.length) {
        const existing = origData.find((data) => data.key === key);
        if (existing) {
          existing.lastUpdateTs = keyData[0][0];
          existing.value = keyData[0][1];
        } else {
          origData.push(
            {
              key,
              lastUpdateTs: keyData[0][0],
              value: keyData[0][1]
            }
          );
        }
      }
    }
    return origData;
  }
}

export class CmdUpdate implements CmdUpdateMsg {
  cmdId: number;
  errorCode: number;
  errorMsg: string;
  cmdUpdateType: CmdUpdateType;

  constructor(msg: CmdUpdateMsg) {
    this.cmdId = msg.cmdId;
    this.errorCode = msg.errorCode;
    this.errorMsg = msg.errorMsg;
    this.cmdUpdateType = msg.cmdUpdateType;
  }
}

export class DataUpdate<T> extends CmdUpdate implements DataUpdateMsg<T> {
  data?: PageData<T>;
  update?: Array<T>;

  constructor(msg: DataUpdateMsg<T>) {
    super(msg);
    this.data = msg.data;
    this.update = msg.update;
  }
}

export class EntityDataUpdate extends DataUpdate<EntityData> {
  constructor(msg: EntityDataUpdateMsg) {
    super(msg);
  }

  private static processEntityData(data: Array<EntityData>, tsOffset: number) {
    for (const entityData of data) {
      if (entityData.timeseries) {
        for (const key of Object.keys(entityData.timeseries)) {
          const tsValues = entityData.timeseries[key];
          for (const tsValue of tsValues) {
            if (tsValue.ts) {
              tsValue.ts += tsOffset;
            }
          }
        }
      }
      if (entityData.latest) {
        for (const entityKeyType of Object.keys(entityData.latest)) {
          const keyTypeValues = entityData.latest[entityKeyType];
          for (const key of Object.keys(keyTypeValues)) {
            const tsValue = keyTypeValues[key];
            if (tsValue.ts) {
              tsValue.ts += tsOffset;
            }
            if (key === entityFields.createdTime.keyName && tsValue.value) {
              tsValue.value = (Number(tsValue.value) + tsOffset) + '';
            }
          }
        }
      }
    }
  }

  public prepareData(tsOffset: number) {
    if (this.data) {
      EntityDataUpdate.processEntityData(this.data.data, tsOffset);
    }
    if (this.update) {
      EntityDataUpdate.processEntityData(this.update, tsOffset);
    }
  }
}

export class AlarmDataUpdate extends DataUpdate<AlarmData> {

  constructor(msg: AlarmDataUpdateMsg) {
    super(msg);
    this.allowedEntities = msg.allowedEntities;
    this.totalEntities = msg.totalEntities;
  }
  allowedEntities: number;
  totalEntities: number;

  private static processAlarmData(data: Array<AlarmData>, tsOffset: number) {
    for (const alarmData of data) {
      alarmData.createdTime += tsOffset;
      if (alarmData.ackTs) {
        alarmData.ackTs += tsOffset;
      }
      if (alarmData.clearTs) {
        alarmData.clearTs += tsOffset;
      }
      if (alarmData.endTs) {
        alarmData.endTs += tsOffset;
      }
      if (alarmData.latest) {
        for (const entityKeyType of Object.keys(alarmData.latest)) {
          const keyTypeValues = alarmData.latest[entityKeyType];
          for (const key of Object.keys(keyTypeValues)) {
            const tsValue = keyTypeValues[key];
            if (tsValue.ts) {
              tsValue.ts += tsOffset;
            }
            if (key in [entityFields.createdTime.keyName,
                        alarmFields.startTime.keyName,
                        alarmFields.endTime.keyName,
                        alarmFields.ackTime.keyName,
                        alarmFields.clearTime.keyName] && tsValue.value) {
              tsValue.value = (Number(tsValue.value) + tsOffset) + '';
            }
          }
        }
      }
    }
  }

  public prepareData(tsOffset: number) {
    if (this.data) {
      AlarmDataUpdate.processAlarmData(this.data.data, tsOffset);
    }
    if (this.update) {
      AlarmDataUpdate.processAlarmData(this.update, tsOffset);
    }
  }
}

export class EntityCountUpdate extends CmdUpdate {
  count: number;

  constructor(msg: EntityCountUpdateMsg) {
    super(msg);
    this.count = msg.count;
  }
}

export class AlarmCountUpdate extends CmdUpdate {
  count: number;

  constructor(msg: AlarmCountUpdateMsg) {
    super(msg);
    this.count = msg.count;
  }
}

export class NotificationCountUpdate extends CmdUpdate {
  totalUnreadCount: number;
  sequenceNumber: number;

  constructor(msg: NotificationCountUpdateMsg) {
    super(msg);
    this.totalUnreadCount = msg.totalUnreadCount;
    this.sequenceNumber = msg.sequenceNumber;
  }
}

export class NotificationsUpdate extends CmdUpdate {
  totalUnreadCount: number;
  sequenceNumber: number;
  update?: Notification;
  notifications?: Notification[];

  constructor(msg: NotificationsUpdateMsg) {
    super(msg);
    this.totalUnreadCount = msg.totalUnreadCount;
    this.sequenceNumber = msg.sequenceNumber;
    this.update = msg.update;
    this.notifications = msg.notifications;
  }
}

export class TelemetrySubscriber extends WsSubscriber {

  private dataSubject = new ReplaySubject<SubscriptionUpdate>(1);
  private entityDataSubject = new ReplaySubject<EntityDataUpdate>(1);
  private alarmDataSubject = new ReplaySubject<AlarmDataUpdate>(1);
  private entityCountSubject = new ReplaySubject<EntityCountUpdate>(1);
  private alarmCountSubject = new ReplaySubject<AlarmCountUpdate>(1);
  private tsOffset = undefined;

  public data$ = this.dataSubject.asObservable();
  public entityData$ = this.entityDataSubject.asObservable();
  public alarmData$ = this.alarmDataSubject.asObservable();
  public entityCount$ = this.entityCountSubject.asObservable();
  public alarmCount$ = this.alarmCountSubject.asObservable();

  public static createEntityAttributesSubscription(telemetryService: TelemetryWebsocketService,
                                                   entityId: EntityId, attributeScope: TelemetryType,
                                                   zone: NgZone, keys: string[] = null): TelemetrySubscriber {
    let subscriptionCommand: SubscriptionCmd;
    if (attributeScope === LatestTelemetry.LATEST_TELEMETRY) {
      subscriptionCommand = new TimeseriesSubscriptionCmd();
    } else {
      subscriptionCommand = new AttributesSubscriptionCmd();
    }
    subscriptionCommand.entityType = entityId.entityType as EntityType;
    subscriptionCommand.entityId = entityId.id;
    subscriptionCommand.scope = attributeScope as AttributeScope;
    if (keys) {
      subscriptionCommand.keys = keys.join(',');
    }
    const subscriber = new TelemetrySubscriber(telemetryService, zone);
    subscriber.subscriptionCommands.push(subscriptionCommand);
    return subscriber;
  }

  public static createEntityFilterLatestSubscription(telemetryService: TelemetryWebsocketService,
                                                     entityFilter: EntityFilter, zone: NgZone,
                                                     latestKeys: EntityKey[] = null): TelemetrySubscriber {
    const entityDataQuery: EntityDataQuery = {
      entityFilter,
      pageLink: {
        pageSize: 1,
        page: 0
      },
      latestValues: latestKeys || []
    };
    const cmd = new EntityDataCmd();
    cmd.query = entityDataQuery;
    cmd.latestCmd = {
      keys: latestKeys || []
    };
    const subscriber = new TelemetrySubscriber(telemetryService, zone);
    subscriber.subscriptionCommands.push(cmd);
    return subscriber;
  }

  constructor(private telemetryService: TelemetryWebsocketService, protected zone?: NgZone) {
    super(telemetryService, zone);
  }

  public complete() {
    this.dataSubject.complete();
    this.entityDataSubject.complete();
    this.alarmDataSubject.complete();
    this.entityCountSubject.complete();
    this.alarmCountSubject.complete();
    super.complete();
  }

  public setTsOffset(tsOffset: number): boolean {
    if (this.tsOffset !== tsOffset) {
      const changed = !isUndefined(this.tsOffset);
      this.tsOffset = tsOffset;
      return changed;
    } else {
      return false;
    }
  }

  public onData(message: SubscriptionUpdate) {
    const cmdId = message.subscriptionId;
    let keys: string[];
    const cmd = this.subscriptionCommands.find((command) => command.cmdId === cmdId);
    if (cmd) {
      const telemetryPluginCmd = cmd as TelemetryPluginCmd;
      if (telemetryPluginCmd.keys && telemetryPluginCmd.keys.length) {
        keys = telemetryPluginCmd.keys.split(',');
      }
    }
    message.prepareData(keys);
    if (this.zone) {
     this.zone.run(
       () => {
         this.dataSubject.next(message);
       }
     );
    } else {
      this.dataSubject.next(message);
    }
  }

  public onEntityData(message: EntityDataUpdate) {
    if (this.tsOffset) {
      message.prepareData(this.tsOffset);
    }
    if (this.zone) {
      this.zone.run(
        () => {
          this.entityDataSubject.next(message);
        }
      );
    } else {
      this.entityDataSubject.next(message);
    }
  }

  public onAlarmData(message: AlarmDataUpdate) {
    if (this.tsOffset) {
      message.prepareData(this.tsOffset);
    }
    if (this.zone) {
      this.zone.run(
        () => {
          this.alarmDataSubject.next(message);
        }
      );
    } else {
      this.alarmDataSubject.next(message);
    }
  }

  public onEntityCount(message: EntityCountUpdate) {
    if (this.zone) {
      this.zone.run(
        () => {
          this.entityCountSubject.next(message);
        }
      );
    } else {
      this.entityCountSubject.next(message);
    }
  }

  public onAlarmCount(message: AlarmCountUpdate) {
    if (this.zone) {
      this.zone.run(
        () => {
          this.alarmCountSubject.next(message);
        }
      );
    } else {
      this.alarmCountSubject.next(message);
    }
  }

  public attributeData$(): Observable<Array<AttributeData>> {
    const attributeData = new Array<AttributeData>();
    return this.data$.pipe(
      map((message) => message.updateAttributeData(attributeData))
    );
  }
}
