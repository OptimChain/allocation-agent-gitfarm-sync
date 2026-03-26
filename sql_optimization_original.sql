%sql
with gam as (   select     ds     , account_id     , account_home_country     , coalesce(is_flagged, 0) as is_flagged     , coalesce(is_entitled, 'unknown') as is_entitled     , first_account_subscription_signup_date as account_signup     , identity_id   from product_performance_de_dev.build.glimpse_account_mapping_hw   where ds >= date_sub('2026-03-17', 2) and ds <= '2026-03-17' )

, engagement_events as (   select     'input' as engagement_event_type,     ip.timestamp_est as engagement_timestamp,     cast(null as bigint) as engagement_timespent_ms,     ip.accepted_at_timestamp_est as engagement_acceptedTimestamp,     ip.container_view_id,     ip.element_id,     ip.input_id as engagement_id,     ip.element_name,     ip.vertical_position,     ip.horizontal_position,     cast(null as string) as direction,     ip.environment_data,     ip.content_transaction_id,     ip.content_set_id,     ip.media_type,     ip.destination_page_id,     ip.element_type,     ip.element_id_type,     ip.input_type as engagement_type,     cast(null as string) as nextElementType,     cast(null as string) as prevElementType,     ip.device_id as engagement_deviceId,     cast(null as int) as engagement_VisitNum,     cast(null as int) as engagement_PageViewnum,     ip.mediaId as mediaId,     ip.programId as programId,     ip.collectionId as collectionId,     ip.contentId as contentId,     ip.input_value,     ip.page_view_id as pvid,     ip.experiment_keys,     ip.experiments,     ip.element_index,     cast(null as string) as app_deeplink_placement,     cast(null as string) as app_deeplink_placement_detail,     cast(null as string) as app_deeplink_distribution_partner,     ip.byw_seed_title,     ip.media_format_type,     ip.session_id,     ip.content_keys.alidId as alid_id,     ip.content_keys.entityId as entity_id,     ip.content_keys.entityType as entity_type,     ip.content_keys.availId as avail_id,     ip.corrected_client_timestamp as engagement_corrected_client_timestamp,     ip.viewing_environment as engagement_viewing_environment,     cast(null as string) as browse_avail_id,     cast(null as array<string>) as missing_entitlements,     ip.time_zone,     cast(null as array<struct<idType:string,id:string,uri:string>>) as engagement_visuals,     cast(null as string) as item_id

from product_performance_de_dev.build.glimpse_inputs_fact_hw ip
where     business_est_date >= date_sub('2026-03-17', 2)
and business_est_date <= '2026-03-17'     and business_est_hour between 0 and 23

union all

select       'interaction' as engagement_event_type,       i.timestamp_est as engagement_timestamp,       cast(null as bigint) as engagement_timespent_ms,       i.accepted_at_timestamp_est as engagement_acceptedTimestamp,       i.container_view_id,       i.element_id,       i.interaction_id as engagement_id,       i.element_name,       i.vertical_position,       i.horizontal_position,       cast(null as string) as direction,       i.environment_data,       i.content_transaction_id,       i.content_set_id,       i.media_type,       i.destination_page_id,       i.element_type,       i.element_id_type,       i.interaction_type as engagement_type,       cast(null as string) as nextElementType,       cast(null as string) as prevElementType,       i.device_id as engagement_deviceId,       cast(null as int) as engagement_VisitNum,       cast(null as int) as engagement_PageViewnum,       i.mediaId as mediaId,       i.programId as programId,       i.collectionId as collectionId,       i.contentId as contentId,       cast(null as string) as input_value,       i.page_view_id as pvid,       i.experiment_keys,       i.experiments,       i.element_index,       cast(null as string) as app_deeplink_placement,       cast(null as string) as app_deeplink_placement_detail,       cast(null as string) as app_deeplink_distribution_partner,       i.byw_seed_title,       i.media_format_type,       i.session_id,       i.content_keys.alidId as alid_id,       i.content_keys.entityId as entity_id,       i.content_keys.entityType as entity_type,       i.content_keys.availId as avail_id,       i.corrected_client_timestamp as engagement_corrected_client_timestamp,       i.viewing_environment as engagement_viewing_environment,       i.browse_avail_id,       i.missing_entitlements,       i.time_zone,       i.visuals as engagement_visuals,       i.item_id

from product_performance_de_dev.build.glimpse_interactions_fact_hw i
where     business_est_date >= date_sub('2026-03-17', 2) and business_est_date <= '2026-03-17'     and business_est_hour between 0 and 23

union all

select       'appdeeplink' as engagement_event_type,       a.timestamp_est as engagement_timestamp,       cast(null as bigint) as engagement_timespent_ms,       a.accepted_at_timestamp_est as engagement_acceptedTimestamp,       cast(null as string) as container_view_id,       cast(null as string) as element_id,       a.app_deeplink_id as engagement_id,       cast(null as string) as element_name,       cast(null as int) as vertical_position,       cast(null as int) as horizontal_position,       cast(null as string) as direction,       a.environment_data,       cast(null as string) as content_transaction_id,       cast(null as string) as content_set_id,       cast(null as string) as media_type,       cast(null as string) as destination_page_id,       cast(null as string) as element_type,       cast(null as string) as element_id_type,       'appdeeplink' as engagement_type,       cast(null as string) as nextElementType,       cast(null as string) as prevElementType,       a.device_id as engagement_deviceId,       cast(null as int) as engagement_VisitNum,       cast(null as int) as engagement_PageViewnum,       cast(null as string) as mediaId,       cast(null as string) as programId,       cast(null as string) as collectionId,       cast(null as string) as contentId,       cast(null as string) as input_value,       a.page_view_id as pvid,       cast(null as array<string>) as experiment_keys,       cast(null as array<struct<experimentPlatform:string,experimentFeatureId:string,experimentId:string,variantId:string>>) as experiments,       cast(null as int) as element_index,       a.placement as app_deeplink_placement,       a.placement_detail as app_deeplink_placement_detail,       a.distribution_partner as app_deeplink_distribution_partner,       cast(null as struct<contentTitle:string,language:string>) as byw_seed_title,       cast(null as string) as media_format_type,       cast(null as string) as session_id,       cast(null as string) as alid_id,       cast(null as string) as entity_id,       cast(null as string) as entity_type,       cast(null as string) as avail_id,       cast(null as timestamp) as engagement_corrected_client_timestamp,       cast(null as string) as engagement_viewing_environment,       cast(null as string) as browse_avail_id,       cast(null as array<string>) as missing_entitlements,       cast(null as struct<timeZoneId:string,inDst:boolean,utcOffset:string,utcOffsetWithDst:string>) as time_zone,       cast(null as array<struct<idType:string,id:string,uri:string>>) as engagement_visuals,       cast(null as string) as item_id

from product_performance_de_dev.build.glimpse_app_deeplink_events_fact_hw a   where     business_est_date >= date_sub('2026-03-17', 2) and business_est_date <= '2026-03-17'     and business_est_hour between 0 and 23 )

, pageview_engagement_events as (
select     pv.business_est_date,     pv.business_est_hour,     pv.device_id,     pv.device_platform,     pv.device_type,     pv.device_profile,     pv.device_family,     pv.device_application_runtime,     pv.account_id,     pv.profile_id,     pv.app_name,     pv.visit_num,     pv.timestamp_est as pageview_timestamp,     pv.page_view_num,     pv.session_start_page_key,     pv.session_end_page_key,     pv.session_start_page_name,     pv.session_end_page_name,     pv.page_name,     pv.page_key,     pv.page_id,     pv.prev_page_name,     pv.next_page_name,     pv.accepted_at_timestamp_est as pageView_acceptedTimestamp,     pv.activity_session_id,     pv.page_view_id,     pv.streaming_service,     pv.platform,     pv.location_country_code,     pv.timespent_ms as pageview_timespent_ms,     pv.kids_mode_enabled,     pv.app_version,     pv.profile_type,     pv.next_page_key,     pv.prev_page_key,     x.engagement_event_type,     x.engagement_timestamp,     x.engagement_timespent_ms,     x.engagement_acceptedTimestamp,     x.container_view_id,     x.element_id,     x.engagement_id,     x.element_name,     c.vertical_position,     c.horizontal_position,     x.direction,     x.environment_data,     c.container_key,     c.container_type,     x.content_transaction_id,     x.content_set_id,     x.media_type,     x.destination_page_id,     x.element_type,     x.element_id_type,     x.engagement_type,     x.nextElementType,     x.prevElementType,     x.engagement_deviceId,     pv.visit_num as engagement_VisitNum,     pv.page_view_num as engagement_PageViewnum,     x.mediaId,     x.programId,     x.collectionId,     x.contentId,     x.input_value,     x.pvid,     x.element_index,     c.elements,     c.timestamp_est as container_view_timestamp,     x.experiment_keys as engagement_experiment_keys,     x.experiments as engagement_experiments,     pv.experiment_keys as pageview_experiment_keys,     pv.experiments as pageview_experiments,     c.experiment_keys as container_experiment_keys,     c.experiments as container_experiments,     pv.group_id,     pv.referrer,     pv.sdk_device_platform,     x.app_deeplink_placement,     x.app_deeplink_placement_detail,     x.app_deeplink_distribution_partner,     x.byw_seed_title,     x.media_format_type,     c.container_style,     pv.background_asset,     pv.background_asset_type,     pv.next_next_page_name,     pv.prev_prev_page_name,     pv.next_next_page_key,     pv.prev_prev_page_key,     pv.distribution_partner,     pv.group_id_type,     pv.session_id,     pv.destination,     regexp_extract(pv.destination,'[?&]cid=([^&]+)', 1) as cid,     pv.session_start_time_est as session_starttimestamp,     pv.session_end_time_est as session_endtimestamp,     pv.browse_backing_id as browse_backing_id,     pv.browse_slug as browse_slug,     pv.browse_style as browse_style,     pv.browse_type as browse_type,     pv.pageview_corrected_client_timestamp as pageview_corrected_client_timestamp,     pv.play_mode as play_mode,     pv.source_stream as source_stream,     x.alid_id as alid_id,     x.entity_id as entity_id,     x.entity_type as entity_type,     x.avail_id as avail_id,     x.engagement_corrected_client_timestamp as engagement_corrected_client_timestamp,     c.browse_content_language,     c.browse_content_title,     c.browse_set_id,     pv.viewing_environment as page_view_viewing_environment,     c.viewing_environment as container_viewing_environment,     x.engagement_viewing_environment,     x.browse_avail_id,     x.missing_entitlements,     c.layout_id,     coalesce(pv.time_zone, x.time_zone, c.time_zone) as time_zone,     c.set_resolution_id,     c.page_resolution_id,     pv.commerce_conditions as pageview_commerce_conditions,     c.containers_commerce_conditions,   pv.is_consented,   x.engagement_visuals,     x.item_id

from product_performance_de_dev.build.glimpse_user_journey_pageviews_state_work_hw as pv
left join engagement_events as x
  on x.engagement_deviceid = pv.device_id     and x.pvid = pv.page_view_id
left join product_performance_de_dev.build.glimpse_containers_fact_hw as c
  on x.container_view_id is not null
  and c.business_est_date = pv.business_est_date
  and x.container_view_id = c.container_view_id
where     pv.business_est_date >= date_sub('2026-03-17', 2) and pv.business_est_date <= '2026-03-17'     and pv.business_est_hour between 0 and 23
)
, watch_interaction as (
  select
    pv.*
    , gam.account_home_country
    , gam.is_flagged
    , gam.is_entitled
    , pi.first_interaction_id as firstinteractionid
    , pi.is_first_interaction_id as isfirstinteractionid
    , pi.interaction_id as watchinteractionid
    , pi.playback_date_est as watchdate_est
    , pi.playback_date_utc as watchdate_utc
    , pi.playback_device_id as watchdeviceid
    , pi.start_timestamp_est as start_date_time_est
    , pi.start_timestamp_utc as start_date_time_utc
    , pi.playback_id as watch_id
    , pi.media_id as media_id
    , pi.program_id as watch_program_id
    , pi.partner_series_id as partner_series_id
    , pi.account_id as watch_account_id
    , pi.runtime_ms as runtime
    , pi.playback_length_ms as watch_length_ms
    , pi.is_completed_stream as is_completed_stream
    , gam.account_signup
    , pi.is_stream as is_stream
    , pi.product_type as product_type
    , gam.identity_id
    , row_number() over(
        partition by pv.device_id,
        pv.activity_session_id,
        pv.page_view_id,
        case
            when pv.engagement_event_type = 'interaction' then 1
            else 0
        end
        order by
            pv.engagement_timestamp desc
    ) as interaction_order_desc
    , pi.watch_source
    , pi.eva_alid_id as watch_alid_id
    , pi.eva_avail_id as watch_avail_id
    , pi.eva_entity_id as watch_entity_id
    , pi.playback_content_presentation
    , pi.playback_viewing_environment
  from pageview_engagement_events as pv
  left join product_performance_de_dev.build.glimpse_playback_interaction_work_hw as pi
    on pi.profile_id = pv.profile_id
    and (pv.engagement_type != 'autoplay'
        or pv.page_name = 'video_player')

    and
        pi.interaction_id = pv.engagement_id

    and pi.business_est_date between dateadd(day, -3, '2026-03-17') and '2026-03-17'
  left join gam
    on gam.ds = pv.business_est_date
    and gam.account_id = pv.account_id
)

, watch_interaction_2 as (
  select
    f.business_est_date
    , f.business_est_hour
    , f.device_id
    , f.account_id
    , f.profile_id
    , f.app_name
    , f.visit_num
    , f.pageview_timestamp
    , f.page_view_num
    , f.session_start_page_key
    , f.session_end_page_key
    , f.session_start_page_name
    , f.session_end_page_name
    , f.page_name
    , f.page_key
    , f.page_id
    , f.prev_page_name
    , f.next_page_name
    , f.pageView_acceptedtimestamp
    , f.activity_session_id
    , f.page_view_id
    , f.streaming_service
    , f.platform
    , f.location_country_code
    , f.pageview_timespent_ms
    , f.engagement_event_type
    , f.engagement_timestamp
    , f.engagement_timespent_ms
    , f.engagement_acceptedtimestamp
    , f.container_view_id
    , f.element_id
    , f.engagement_id
    , f.element_name
    , f.vertical_position
    , f.horizontal_position
    , cast(f.direction as int) as direction
    , f.environment_data
    , f.container_type
    , f.container_key
    , f.content_transaction_id
    , f.content_set_id
    , f.media_type
    , f.destination_page_id
    , f.element_type
    , f.element_id_type
    , f.engagement_type
    , f.nextElementType
    , f.prevElementType
    , f.engagement_deviceId
    , f.engagement_VisitNum
    , f.engagement_PageViewnum
    , f.mediaId
    , f.programId
    , f.collectionId
    , f.contentId
    , f.input_value
    , f.pvid
    , f.account_home_country
    , f.is_flagged
    , f.is_entitled
    , f.firstInteractionId
    , f.isfirstinteractionid
    , f.watchInteractionId
    , f.watchDate_est
    , f.watchDate_utc
    , f.watchDeviceId
    , f.start_date_time_est
    , f.start_date_time_utc
    , f.watch_id
    , f.media_id
    , f.watch_program_id
    , f.partner_series_id
    , f.watch_account_id
    , f.device_platform
    , f.device_type
    , f.profile_type
    , f.runtime
    , f.watch_length_ms
    , f.is_completed_stream
    , f.session_starttimestamp
    , f.session_endtimestamp
    , first_value(case when f.engagement_type='deeplink' then 'deeplink' end) ignore nulls
        over(partition by f.device_id, f.activity_session_id, f.page_view_id
        order by nvl(f.engagement_timestamp, f.pageview_timestamp) desc) as ppk
    , case when f.watch_id is not null then true else false end as endInWatch
    , row_number() over(partition by f.device_id, f.activity_session_id, iff(f.watch_id is not null, true, false)
        order by nvl(f.pageview_timestamp, f.engagement_timestamp))  as watch_number
    , f.kids_mode_enabled
    , f.app_version
    , case when watch_id is not null then TRUE
        when f.watch_id is null
            and f.platform in ('android_mobile', 'android_tv', 'fire_tv', 'fire_tablet')
            and (
                    (f.engagement_event_type = 'interaction' and f.next_page_name = 'video_player' and f.interaction_order_desc = 1)
                    or ppk = 'deeplink'
                    or (f.page_name = 'video_player' and f.page_view_num = 1)
                ) then TRUE
        when f.watch_id is null
            and f.platform not in ('android_mobile', 'android_tv', 'fire_tv', 'fire_tablet')
            and (
                f.engagement_event_type = 'interaction' and f.next_page_name = 'video_player' and f.interaction_order_desc = 1
                or ppk = 'deeplink'
                or (f.page_name = 'video_player' and f.page_view_num = 1)
                ) then TRUE
        else FALSE end as endInWatch_inferred
    , f.device_profile
    , f.device_family
    , f.device_application_runtime
    , f.elements
    , f.account_signup
    , f.is_stream
    , f.container_view_timestamp
    , f.pageview_experiment_keys
    , f.pageview_experiments
    , f.engagement_experiment_keys
    , f.engagement_experiments
    , f.container_experiment_keys
    , f.container_experiments
    , f.group_id
    , f.element_index
    , f.referrer
    , f.sdk_device_platform
    , f.app_deeplink_placement
    , f.app_deeplink_placement_detail
    , f.app_deeplink_distribution_partner
    , f.next_page_key
    , f.prev_page_key
    , f.byw_seed_title
    , f.media_format_type
    , f.container_style
    , f.background_asset
    , f.background_asset_type
    , f.next_next_page_name
    , f.prev_prev_page_name
    , f.next_next_page_key
    , f.prev_prev_page_key
    , f.distribution_partner
    , f.group_id_type
    , lag(f.container_key) ignore nulls over
           (partition by f.device_id, f.activity_session_id, f.account_id, f.profile_id
           order by f.container_view_timestamp) as prev_container_key
    , lead(f.container_key) ignore nulls over
           (partition by f.device_id, f.activity_session_id, f.account_id, f.profile_id
           order by f.container_view_timestamp) as next_container_key
    , lag(case when f.page_name like '%details%' then f.container_key end) ignore nulls over
           (partition by f.device_id, f.activity_session_id, f.account_id, f.profile_id
           order by f.container_view_timestamp) as prev_container_key_details
    , f.product_type
    , f.session_id
    , f.identity_id
    , f.destination
    , f.cid
    , f.watch_source
    , f.browse_backing_id
    , f.browse_slug
    , f.browse_style
    , f.browse_type
    , f.pageview_corrected_client_timestamp
    , f.play_mode
    , f.source_stream
    , f.alid_id
    , f.entity_id
    , f.entity_type
    , f.avail_id
    , f.engagement_corrected_client_timestamp
    , f.browse_content_language
    , f.browse_content_title
    , f.browse_set_id
    , f.watch_alid_id
    , f.watch_avail_id
    , f.watch_entity_id
    , f.page_view_viewing_environment
    , f.container_viewing_environment
    , f.engagement_viewing_environment
    , f.playback_content_presentation
    , f.playback_viewing_environment
    , f.browse_avail_id
    , f.missing_entitlements
    , f.time_zone
    , f.set_resolution_id
    , f.page_resolution_id
    , f.pageview_commerce_conditions
    , f.containers_commerce_conditions
    , f.is_consented
    , f.engagement_visuals
    , f.item_id
  from watch_interaction as f
)

insert into tracker_full_dev.product_performance.glimpse_user_journey_stage_lc_v5
  (
  business_est_date
  , business_est_hour
  , device_id
  , account_id
  , profile_id
  , app_name
  , visit_num
  , pageview_timestamp
  , page_view_num
  , session_startpagekey
  , session_endpagekey
  , session_startpagename
  , session_endpagename
  , page_name
  , page_key
  , page_id
  , prevpagename
  , nextpagename
  , pageview_acceptedtimestamp
  , activity_session_id
  , page_view_id
  , streaming_service
  , platform
  , location_country_code
  , pageview_timespent_ms
  , engagement_event_type
  , engagement_timestamp
  , engagement_timespent_ms
  , engagement_acceptedtimestamp
  , container_view_id
  , element_id
  , engagement_id
  , element_name
  , vertical_position
  , horizontal_position
  , direction
  , environment_data
  , container_type
  , container_key
  , content_transaction_id
  , content_set_id
  , media_type
  , destination_page_id
  , element_type
  , element_id_type
  , engagement_type
  , nextelementtype
  , prevelementtype
  , engagement_deviceid
  , engagement_visitnum
  , engagement_pageviewnum
  , mediaid
  , programid
  , collectionid
  , contentid
  , input_value
  , pvid
  , account_home_country
  , is_flagged
  , is_entitled
  , firstinteractionid
  , isfirstinteractionid
  , watchinteractionid
  , watchdate_est
  , watchdate_utc
  , watchdeviceid
  , start_date_time_est
  , start_date_time_utc
  , watch_id
  , media_id
  , watch_program_id
  , partner_series_id
  , watch_account_id
  , device_platform
  , device_type
  , profile_type
  , runtime
  , watch_length_ms
  , is_completed_stream
  , session_starttimestamp
  , session_endtimestamp
  , ppk
  , endinwatch
  , watch_number
  , kids_mode_enabled
  , app_version
  , endinwatch_inferred
  , device_profile
  , device_family
  , device_application_runtime
  , elements
  , account_signup
  , is_stream
  , container_view_timestamp
  , pageview_experiment_keys
  , pageview_experiments
  , engagement_experiment_keys
  , engagement_experiments
  , container_experiment_keys
  , container_experiments
  , group_id
  , element_index
  , referrer
  , sdk_device_platform
  , app_deeplink_placement
  , app_deeplink_placement_detail
  , app_deeplink_distribution_partner
  , nextpagekey
  , prevpagekey
  , byw_seed_title
  , media_format_type
  , container_style
  , background_asset
  , background_asset_type
  , next_next_page_name
  , prev_prev_page_name
  , next_next_pagekey
  , prev_prev_pagekey
  , distribution_partner
  , group_id_type
  , prev_container_key
  , next_container_key
  , prev_container_key_details
  , product_type
  , session_id
  , identity_id
  , destination
  , cid
  , next_endinwatch_inferred
  , browse_backing_id
  , browse_slug
  , browse_style
  , browse_type
  , pageview_corrected_client_timestamp
  , play_mode
  , source_stream
  , alid_id
  , entity_id
  , entity_type
  , avail_id
  , engagement_corrected_client_timestamp
  , watch_source
  , browse_content_language
  , browse_content_title
  , browse_set_id
  , watch_alid_id
  , watch_avail_id
  , watch_entity_id
  , page_view_viewing_environment
  , container_viewing_environment
  , engagement_viewing_environment
  , playback_content_presentation
  , playback_viewing_environment
  , browse_avail_id
  , missing_entitlements
  , time_zone
  , set_resolution_id
  , page_resolution_id
  , pageview_commerce_conditions
  , containers_commerce_conditions
  , is_consented
  , engagement_visuals
  , item_id
  )
  select
  ujf.business_est_date
  , ujf.business_est_hour
  , ujf.device_id
  , ujf.account_id
  , ujf.profile_id
  , ujf.app_name
  , ujf.visit_num
  , ujf.pageview_timestamp
  , ujf.page_view_num
  , ujf.session_start_page_key
  , ujf.session_end_page_key
  , ujf.session_start_page_name
  , ujf.session_end_page_name
  , ujf.page_name
  , ujf.page_key
  , ujf.page_id
  , ujf.prev_page_name
  , ujf.next_page_name
  , ujf.pageView_acceptedtimestamp
  , ujf.activity_session_id
  , ujf.page_view_id
  , ujf.streaming_service
  , ujf.platform
  , ujf.location_country_code
  , ujf.pageview_timespent_ms
  , ujf.engagement_event_type
  , ujf.engagement_timestamp
  , ujf.engagement_timespent_ms
  , ujf.engagement_acceptedtimestamp
  , ujf.container_view_id
  , ujf.element_id
  , ujf.engagement_id
  , ujf.element_name
  , ujf.vertical_position
  , ujf.horizontal_position
  , ujf.direction
  , ujf.environment_data
  , ujf.container_type
  , ujf.container_key
  , ujf.content_transaction_id
  , ujf.content_set_id
  , ujf.media_type
  , ujf.destination_page_id
  , ujf.element_type
  , ujf.element_id_type
  , ujf.engagement_type
  , ujf.nextElementType
  , ujf.prevElementType
  , ujf.engagement_deviceId
  , ujf.engagement_VisitNum
  , ujf.engagement_PageViewnum
  , ujf.mediaId
  , ujf.programId
  , ujf.collectionId
  , ujf.contentId
  , ujf.input_value
  , ujf.pvid
  , ujf.account_home_country
  , ujf.is_flagged
  , ujf.is_entitled
  , ujf.firstInteractionId
  , ujf.isfirstinteractionid
  , ujf.watchInteractionId
  , ujf.watchDate_est
  , ujf.watchDate_utc
  , ujf.watchDeviceId
  , ujf.start_date_time_est
  , ujf.start_date_time_utc
  , ujf.watch_id
  , ujf.media_id
  , ujf.watch_program_id
  , ujf.partner_series_id
  , ujf.watch_account_id
  , ujf.device_platform
  , ujf.device_type
  , ujf.profile_type
  , ujf.runtime
  , ujf.watch_length_ms
  , ujf.is_completed_stream
  , ujf.session_starttimestamp
  , ujf.session_endtimestamp
  , ujf.ppk
  , ujf.endInWatch
  , ujf.watch_number
  , ujf.kids_mode_enabled
  , ujf.app_version
  , ujf.endInWatch_inferred
  , ujf.device_profile
  , ujf.device_family
  , ujf.device_application_runtime
  , ujf.elements
  , ujf.account_signup
  , ujf.is_stream
  , ujf.container_view_timestamp
  , ujf.pageview_experiment_keys
  , ujf.pageview_experiments
  , ujf.engagement_experiment_keys
  , ujf.engagement_experiments
  , ujf.container_experiment_keys
  , ujf.container_experiments
  , ujf.group_id
  , ujf.element_index
  , ujf.referrer
  , ujf.sdk_device_platform
  , ujf.app_deeplink_placement
  , ujf.app_deeplink_placement_detail
  , ujf.app_deeplink_distribution_partner
  , ujf.next_page_key
  , ujf.prev_page_key
  , ujf.byw_seed_title
  , ujf.media_format_type
  , ujf.container_style
  , ujf.background_asset
  , ujf.background_asset_type
  , ujf.next_next_page_name
  , ujf.prev_prev_page_name
  , ujf.next_next_page_key
  , ujf.prev_prev_page_key
  , ujf.distribution_partner
  , ujf.group_id_type
  , ujf.prev_container_key
  , ujf.next_container_key
  , ujf.prev_container_key_details
  , ujf.product_type
  , ujf.session_id
  , ujf.identity_id
  , ujf.destination
  , ujf.cid
  , lead(endinwatch_inferred) over (partition by ujf.business_est_date, ujf.device_id, ujf.activity_session_id, ujf.account_id order by ujf.page_view_num) as next_endinwatch_inferred
  , ujf.browse_backing_id
  , ujf.browse_slug
  , ujf.browse_style
  , ujf.browse_type
  , ujf.pageview_corrected_client_timestamp
  , ujf.play_mode
  , ujf.source_stream
  , ujf.alid_id
  , ujf.entity_id
  , ujf.entity_type
  , ujf.avail_id
  , ujf.engagement_corrected_client_timestamp
  , ujf.watch_source
  , ujf.browse_content_language
  , ujf.browse_content_title
  , ujf.browse_set_id
  , ujf.watch_alid_id
  , ujf.watch_avail_id
  , ujf.watch_entity_id
  , ujf.page_view_viewing_environment
  , ujf.container_viewing_environment
  , ujf.engagement_viewing_environment
  , ujf.playback_content_presentation
  , ujf.playback_viewing_environment
  , ujf.browse_avail_id
  , ujf.missing_entitlements
  , ujf.time_zone
  , ujf.set_resolution_id
  , ujf.page_resolution_id
  , ujf.pageview_commerce_conditions
  , ujf.containers_commerce_conditions
  , ujf.is_consented
  , ujf.engagement_visuals
  , ujf.item_id
  from watch_interaction_2 as ujf
  where
    ujf.business_est_date >= date_sub('2026-03-17', 1)
      and ujf.business_est_date <= '2026-03-17';
